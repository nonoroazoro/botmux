import { resetMemoryFs } from '../../helpers/memory-fs/index.js';
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async () => (await import('../../helpers/memory-fs/index.js')).fs);
vi.mock('node:fs/promises', async () => (await import('../../helpers/memory-fs/index.js')).fs.promises);

// Reset the in-memory fixture tree between cases; no host directories are created.
beforeEach(() => {
  resetMemoryFs({
    '/fixtures/botmux-capability-notification-1': null,
  });
});

import { CapabilityNotificationOutbox } from '../../../src/core/capabilities/index.js';

describe('CapabilityNotificationOutbox', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = '/fixtures/botmux-capability-notification-1';
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('persists failed notifications and delivers them after restart', async () => {
    const failedSend = vi.fn(async () => {
      throw new Error('transport unavailable');
    });
    const first = new CapabilityNotificationOutbox({
      dataDir,
      larkAppId: 'app_1',
      send: failedSend,
      logger: { warn: vi.fn() },
      retryMs: 60_000,
    });
    first.stop();
    first.enqueue({
      recipientOpenId: 'ou_requester',
      card: '{"type":"card"}',
      dispatchUuid: 'capr-request-accepted',
    });

    await first.flush();

    expect(failedSend).toHaveBeenCalledOnce();
    expect(readdirSync(join(dataDir, 'capability-notifications', 'app_1'))).toHaveLength(1);

    const deliveredSend = vi.fn(async () => undefined);
    const recovered = new CapabilityNotificationOutbox({
      dataDir,
      larkAppId: 'app_1',
      send: deliveredSend,
      retryMs: 60_000,
    });
    recovered.stop();

    await recovered.flush();

    expect(deliveredSend).toHaveBeenCalledWith(
      'ou_requester',
      '{"type":"card"}',
      'capr-request-accepted',
    );
    expect(readdirSync(join(dataDir, 'capability-notifications', 'app_1'))).toEqual([]);
  });

  it('deduplicates the same recipient and dispatch UUID', () => {
    const outbox = new CapabilityNotificationOutbox({
      dataDir,
      larkAppId: 'app_1',
      send: async () => undefined,
    });
    outbox.stop();
    const notification = {
      recipientOpenId: 'ou_requester',
      card: '{"type":"card"}',
      dispatchUuid: 'capr-request-rejected',
    };

    outbox.enqueue(notification);
    outbox.enqueue(notification);

    expect(readdirSync(join(dataDir, 'capability-notifications', 'app_1'))).toHaveLength(1);
  });

  it('holds queued notifications until startup recovery completes', async () => {
    const send = vi.fn(async () => undefined);
    const outbox = new CapabilityNotificationOutbox({
      dataDir,
      larkAppId: 'app_1',
      send,
    });
    outbox.enqueue({
      recipientOpenId: 'ou_requester',
      card: '{"type":"card"}',
      dispatchUuid: 'capr-request-accepted',
    });

    await Promise.resolve();
    expect(send).not.toHaveBeenCalled();

    outbox.start();
    await outbox.flush();
    outbox.stop();

    expect(send).toHaveBeenCalledOnce();
  });
});
