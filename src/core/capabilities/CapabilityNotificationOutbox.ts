import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';

import { atomicWriteFileSync } from '../../utils/atomic-write.js';
import { withFileLockSync } from '../../utils/file-lock.js';

const NOTIFICATION_TTL_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_RETRY_MS = 30_000;
const NOTIFICATION_FILE_RE = /^cn_[0-9a-f]{32}\.json$/;
const LARK_APP_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const OPEN_ID_RE = /^ou_[A-Za-z0-9_-]{1,128}$/;
const MAX_CARD_BYTES = 100 * 1_024;
const MAX_DISPATCH_UUID_LENGTH = 128;

type NotificationRecord = {
  schemaVersion: 1;
  notificationId: string;
  larkAppId: string;
  recipientOpenId: string;
  card: string;
  dispatchUuid: string;
  createdAt: string;
  expiresAt: string;
};

export class CapabilityNotificationOutbox {
  private readonly _root: string;
  private readonly _larkAppId: string;
  private readonly _send: (
    recipientOpenId: string,
    card: string,
    dispatchUuid: string,
  ) => Promise<void>;
  private readonly _logger: Pick<Console, 'warn'>;
  private readonly _retryMs: number;
  private _timer: NodeJS.Timeout | undefined;
  private _running: Promise<void> | undefined;
  private _stopped = true;

  constructor(input: {
    dataDir: string;
    larkAppId: string;
    send(
      recipientOpenId: string,
      card: string,
      dispatchUuid: string,
    ): Promise<void>;
    logger?: Pick<Console, 'warn'>;
    retryMs?: number;
  }) {
    if (!LARK_APP_ID_RE.test(input.larkAppId)) {
      throw new Error('Invalid capability notification app');
    }
    const retryMs = input.retryMs ?? DEFAULT_RETRY_MS;
    if (!Number.isSafeInteger(retryMs) || retryMs < 1) {
      throw new Error('Invalid capability notification retry interval');
    }
    this._root = join(input.dataDir, 'capability-notifications', input.larkAppId);
    this._larkAppId = input.larkAppId;
    this._send = input.send;
    this._logger = input.logger ?? console;
    this._retryMs = retryMs;
  }

  start(): void {
    this._stopped = false;
    this._schedule(0);
  }

  stop(): void {
    this._stopped = true;
    if (this._timer) clearTimeout(this._timer);
    this._timer = undefined;
  }

  enqueue(input: {
    recipientOpenId: string;
    card: string;
    dispatchUuid: string;
    now?: Date;
  }): void {
    if (!OPEN_ID_RE.test(input.recipientOpenId)) {
      throw new Error('Invalid capability notification recipient');
    }
    if (
      !input.card.trim()
      || Buffer.byteLength(input.card, 'utf8') > MAX_CARD_BYTES
      || !input.dispatchUuid.trim()
      || input.dispatchUuid.length > MAX_DISPATCH_UUID_LENGTH
    ) {
      throw new Error('Invalid capability notification payload');
    }
    const notificationId = `cn_${createHash('sha256')
      .update(`${this._larkAppId}\0${input.recipientOpenId}\0${input.dispatchUuid}`, 'utf8')
      .digest('hex')
      .slice(0, 32)}`;
    const path = join(this._root, `${notificationId}.json`);
    const now = input.now ?? new Date();
    mkdirSync(this._root, { recursive: true, mode: 0o700 });
    withFileLockSync(path, () => {
      if (existsSync(path)) return;
      const record: NotificationRecord = {
        schemaVersion: 1,
        notificationId,
        larkAppId: this._larkAppId,
        recipientOpenId: input.recipientOpenId,
        card: input.card,
        dispatchUuid: input.dispatchUuid,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + NOTIFICATION_TTL_MS).toISOString(),
      };
      atomicWriteFileSync(path, `${JSON.stringify(record)}\n`, {
        mode: 0o600,
        durable: true,
        followTargetSymlink: false,
      });
    }, { maxWaitMs: 3_000 });
    this._schedule(0);
  }

  flush(): Promise<void> {
    if (this._running) return this._running;
    this._running = this._flush().finally(() => {
      this._running = undefined;
      if (!this._stopped) {
        try {
          if (this._pendingPaths().length > 0) this._schedule(this._retryMs);
        } catch (error) {
          this._logger.warn(
            `[capability-notification] pending scan failed: `
            + `${error instanceof Error ? error.message : String(error)}`,
          );
          this._schedule(this._retryMs);
        }
      }
    });
    return this._running;
  }

  private _schedule(delayMs: number): void {
    if (this._stopped || this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = undefined;
      void this.flush().catch((error) => {
        this._logger.warn(
          `[capability-notification] flush failed: `
          + `${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, delayMs);
    this._timer.unref?.();
  }

  private _pendingPaths(): string[] {
    if (!existsSync(this._root)) return [];
    return readdirSync(this._root)
      .filter((name) => NOTIFICATION_FILE_RE.test(name))
      .sort()
      .map((name) => join(this._root, name));
  }

  private _read(path: string): NotificationRecord {
    const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<NotificationRecord>;
    if (
      value.schemaVersion !== 1
      || typeof value.notificationId !== 'string'
      || !/^cn_[0-9a-f]{32}$/.test(value.notificationId)
      || value.larkAppId !== this._larkAppId
      || typeof value.recipientOpenId !== 'string'
      || !OPEN_ID_RE.test(value.recipientOpenId)
      || typeof value.card !== 'string'
      || !value.card.trim()
      || Buffer.byteLength(value.card, 'utf8') > MAX_CARD_BYTES
      || typeof value.dispatchUuid !== 'string'
      || !value.dispatchUuid.trim()
      || value.dispatchUuid.length > MAX_DISPATCH_UUID_LENGTH
      || typeof value.createdAt !== 'string'
      || !Number.isFinite(Date.parse(value.createdAt))
      || typeof value.expiresAt !== 'string'
      || !Number.isFinite(Date.parse(value.expiresAt))
    ) throw new Error('Invalid capability notification');
    return value as NotificationRecord;
  }

  private async _flush(): Promise<void> {
    for (const path of this._pendingPaths()) {
      let record: NotificationRecord;
      try {
        record = this._read(path);
      } catch (error) {
        try { renameSync(path, `${path}.invalid-${Date.now()}`); } catch { /* Preserve if quarantine fails. */ }
        this._logger.warn(
          `[capability-notification] invalid item: ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }
      if (Date.parse(record.expiresAt) <= Date.now()) {
        try { unlinkSync(path); } catch { /* Another delivery may have removed it. */ }
        continue;
      }
      try {
        await this._send(record.recipientOpenId, record.card, record.dispatchUuid);
        try { unlinkSync(path); } catch { /* Another delivery may have removed it. */ }
      } catch (error) {
        this._logger.warn(
          `[capability-notification:${record.notificationId}] delivery failed: `
          + `${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
