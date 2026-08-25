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
import { canonicalJsonStringify } from '../../utils/canonical-json.js';
import { withFileLockSync } from '../../utils/file-lock.js';
import type { CapabilityProposalDeliveryOutcome } from './types.js';

const DEFAULT_RETRY_MS = 30_000;
const PROPOSAL_ID_RE = /^cp_[0-9a-f]{32}$/;
const DELIVERY_FILE_RE = /^cp_[0-9a-f]{32}\.json$/;
const LARK_APP_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const OPEN_ID_RE = /^ou_[A-Za-z0-9_-]{1,128}$/;
const NONCE_RE = /^[0-9a-f]{64}$/;
const MAX_CARD_BYTES = 100 * 1_024;
const MAX_DISPATCH_UUID_LENGTH = 128;

type ProposalDeliveryRecord = {
  schemaVersion: 1;
  state: 'pending' | 'delivered';
  proposalId: string;
  nonce: string;
  larkAppId: string;
  recipientOpenId: string;
  card: string;
  dispatchUuid: string;
  messageId?: string;
  createdAt: string;
  expiresAt: string;
};

export class CapabilityProposalOutbox {
  private readonly _root: string;
  private readonly _larkAppId: string;
  private readonly _send: (
    recipientOpenId: string,
    card: string,
    dispatchUuid: string,
  ) => Promise<string>;
  private readonly _isActive: (proposalId: string, nonce: string) => boolean;
  private readonly _logger: Pick<Console, 'warn'>;
  private readonly _retryMs: number;
  private readonly _deliveries = new Map<string, Promise<CapabilityProposalDeliveryOutcome>>();
  private _timer: NodeJS.Timeout | undefined;
  private _flushRunning: Promise<void> | undefined;
  private _stopped = true;

  constructor(input: {
    dataDir: string;
    larkAppId: string;
    send(
      recipientOpenId: string,
      card: string,
      dispatchUuid: string,
    ): Promise<string>;
    isActive(proposalId: string, nonce: string): boolean;
    logger?: Pick<Console, 'warn'>;
    retryMs?: number;
  }) {
    if (!LARK_APP_ID_RE.test(input.larkAppId)) {
      throw new Error('Invalid capability proposal delivery app');
    }
    const retryMs = input.retryMs ?? DEFAULT_RETRY_MS;
    if (!Number.isSafeInteger(retryMs) || retryMs < 1) {
      throw new Error('Invalid capability proposal delivery retry interval');
    }
    this._root = join(input.dataDir, 'capability-proposal-deliveries', input.larkAppId);
    this._larkAppId = input.larkAppId;
    this._send = input.send;
    this._isActive = input.isActive;
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
    proposalId: string;
    nonce: string;
    recipientOpenId: string;
    card: string;
    dispatchUuid: string;
    expiresAt: string;
    now?: Date;
  }): void {
    if (
      !PROPOSAL_ID_RE.test(input.proposalId)
      || !NONCE_RE.test(input.nonce)
      || !OPEN_ID_RE.test(input.recipientOpenId)
      || !input.card.trim()
      || Buffer.byteLength(input.card, 'utf8') > MAX_CARD_BYTES
      || !input.dispatchUuid.trim()
      || input.dispatchUuid.length > MAX_DISPATCH_UUID_LENGTH
      || !Number.isFinite(Date.parse(input.expiresAt))
    ) {
      throw new Error('Invalid capability proposal delivery payload');
    }
    const path = this._path(input.proposalId);
    const now = input.now ?? new Date();
    const record: ProposalDeliveryRecord = {
      schemaVersion: 1,
      state: 'pending',
      proposalId: input.proposalId,
      nonce: input.nonce,
      larkAppId: this._larkAppId,
      recipientOpenId: input.recipientOpenId,
      card: input.card,
      dispatchUuid: input.dispatchUuid,
      createdAt: now.toISOString(),
      expiresAt: input.expiresAt,
    };
    mkdirSync(this._root, { recursive: true, mode: 0o700 });
    withFileLockSync(path, () => {
      if (existsSync(path)) {
        const existing = this._read(path);
        const comparable = (value: ProposalDeliveryRecord) => ({
          proposalId: value.proposalId,
          nonce: value.nonce,
          larkAppId: value.larkAppId,
          recipientOpenId: value.recipientOpenId,
          card: value.card,
          dispatchUuid: value.dispatchUuid,
          expiresAt: value.expiresAt,
        });
        const sameDelivery = canonicalJsonStringify(comparable(existing))
          === canonicalJsonStringify(comparable(record));
        if (!sameDelivery) throw new Error('Capability proposal delivery already exists');
        return;
      }
      atomicWriteFileSync(path, `${canonicalJsonStringify(record)}\n`, {
        mode: 0o600,
        durable: true,
        followTargetSymlink: false,
      });
    }, { maxWaitMs: 3_000 });
    this._schedule(0);
  }

  cancel(proposalId: string): void {
    if (!PROPOSAL_ID_RE.test(proposalId)) return;
    try { unlinkSync(this._path(proposalId)); } catch { /* Already delivered or absent. */ }
  }

  has(proposalId: string): boolean {
    if (!PROPOSAL_ID_RE.test(proposalId)) return false;
    const path = this._path(proposalId);
    if (!existsSync(path)) return false;
    try {
      const record = this._read(path);
      return Date.parse(record.expiresAt) > Date.now()
        && this._isActive(record.proposalId, record.nonce);
    } catch (error) {
      try { renameSync(path, `${path}.invalid-${Date.now()}`); } catch { /* Preserve if quarantine fails. */ }
      this._logger.warn(
        `[capability-proposal-delivery] invalid item: `
        + `${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  deliver(proposalId: string): Promise<CapabilityProposalDeliveryOutcome> {
    if (!PROPOSAL_ID_RE.test(proposalId)) {
      return Promise.resolve({ state: 'inactive' });
    }
    const active = this._deliveries.get(proposalId);
    if (active) return active;
    const delivery = this._deliver(proposalId).finally(() => {
      this._deliveries.delete(proposalId);
    });
    this._deliveries.set(proposalId, delivery);
    return delivery;
  }

  flush(): Promise<void> {
    if (this._flushRunning) return this._flushRunning;
    this._flushRunning = this._flush().finally(() => {
      this._flushRunning = undefined;
      if (!this._stopped && this._pendingPaths().length > 0) {
        this._schedule(this._retryMs);
      }
    });
    return this._flushRunning;
  }

  private _path(proposalId: string): string {
    return join(this._root, `${proposalId}.json`);
  }

  private _schedule(delayMs: number): void {
    if (this._stopped || this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = undefined;
      void this.flush().catch((error) => {
        this._logger.warn(
          `[capability-proposal-delivery] flush failed: `
          + `${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, delayMs);
    this._timer.unref?.();
  }

  private _pendingPaths(): string[] {
    if (!existsSync(this._root)) return [];
    return readdirSync(this._root)
      .filter((name) => DELIVERY_FILE_RE.test(name))
      .sort()
      .map((name) => join(this._root, name))
      .filter((path) => {
        try {
          const record = this._read(path);
          if (
            Date.parse(record.expiresAt) <= Date.now()
            || !this._isActive(record.proposalId, record.nonce)
          ) {
            this.cancel(record.proposalId);
            return false;
          }
          return record.state === 'pending';
        } catch (error) {
          try { renameSync(path, `${path}.invalid-${Date.now()}`); } catch { /* Preserve if quarantine fails. */ }
          this._logger.warn(
            `[capability-proposal-delivery] invalid item: `
            + `${error instanceof Error ? error.message : String(error)}`,
          );
          return false;
        }
      });
  }

  private _read(path: string): ProposalDeliveryRecord {
    const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<ProposalDeliveryRecord>;
    if (
      value.schemaVersion !== 1
      || (value.state !== 'pending' && value.state !== 'delivered')
      || typeof value.proposalId !== 'string'
      || !PROPOSAL_ID_RE.test(value.proposalId)
      || typeof value.nonce !== 'string'
      || !NONCE_RE.test(value.nonce)
      || value.larkAppId !== this._larkAppId
      || typeof value.recipientOpenId !== 'string'
      || !OPEN_ID_RE.test(value.recipientOpenId)
      || typeof value.card !== 'string'
      || !value.card.trim()
      || Buffer.byteLength(value.card, 'utf8') > MAX_CARD_BYTES
      || typeof value.dispatchUuid !== 'string'
      || !value.dispatchUuid.trim()
      || value.dispatchUuid.length > MAX_DISPATCH_UUID_LENGTH
      || (value.state === 'pending' && value.messageId !== undefined)
      || (value.state === 'delivered'
        && (typeof value.messageId !== 'string' || !value.messageId.trim()))
      || typeof value.createdAt !== 'string'
      || !Number.isFinite(Date.parse(value.createdAt))
      || typeof value.expiresAt !== 'string'
      || !Number.isFinite(Date.parse(value.expiresAt))
    ) throw new Error('Invalid capability proposal delivery');
    return value as ProposalDeliveryRecord;
  }

  private async _deliver(proposalId: string): Promise<CapabilityProposalDeliveryOutcome> {
    const path = this._path(proposalId);
    if (!existsSync(path)) return { state: 'inactive' };
    let record: ProposalDeliveryRecord;
    try {
      record = this._read(path);
    } catch (error) {
      try { renameSync(path, `${path}.invalid-${Date.now()}`); } catch { /* Preserve if quarantine fails. */ }
      this._logger.warn(
        `[capability-proposal-delivery] invalid item: `
        + `${error instanceof Error ? error.message : String(error)}`,
      );
      return { state: 'inactive' };
    }
    if (
      Date.parse(record.expiresAt) <= Date.now()
      || !this._isActive(record.proposalId, record.nonce)
    ) {
      this.cancel(record.proposalId);
      return { state: 'inactive' };
    }
    if (record.state === 'delivered') {
      if (!record.messageId) return { state: 'inactive' };
      return { state: 'delivered', messageId: record.messageId };
    }
    try {
      const messageId = await this._send(
        record.recipientOpenId,
        record.card,
        record.dispatchUuid,
      );
      withFileLockSync(path, () => {
        const current = this._read(path);
        if (current.state === 'delivered') return;
        atomicWriteFileSync(path, `${canonicalJsonStringify({
          ...current,
          state: 'delivered',
          messageId,
        })}\n`, {
          mode: 0o600,
          durable: true,
          followTargetSymlink: false,
        });
      }, { maxWaitMs: 3_000 });
      return { state: 'delivered', messageId };
    } catch (error) {
      this._logger.warn(
        `[capability-proposal-delivery:${record.proposalId}] delivery failed: `
        + `${error instanceof Error ? error.message : String(error)}`,
      );
      return { state: 'failed', error };
    }
  }

  private async _flush(): Promise<void> {
    for (const path of this._pendingPaths()) {
      const proposalId = path.slice(path.lastIndexOf('/') + 1, -'.json'.length);
      await this.deliver(proposalId);
    }
  }
}
