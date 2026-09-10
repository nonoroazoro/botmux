import { resetMemoryFs } from './helpers/memory-fs/index.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('node:fs', async () => (await import('./helpers/memory-fs/index.js')).fs);
vi.mock('node:fs/promises', async () => (await import('./helpers/memory-fs/index.js')).fs.promises);

beforeEach(() => {
  resetMemoryFs({
    '/fixtures/botmux-webhook-life-1': null,
    '/fixtures/botmux-webhook-life-2': null,
    '/fixtures/botmux-webhook-life-3': null,
    '/fixtures/botmux-webhook-life-4': null,
  });
});
import {
  activateWebhookLifecycleGroup,
  beginWebhookLifecycleFiring,
  failWebhookLifecycleGroup,
  listWebhookLifecycleRecords,
  resolveWebhookLifecycleGroup,
} from '../src/services/webhook-lifecycle-store.js';

describe('webhook-lifecycle-store', () => {
  it('atomically claims one creator for the same connector and dedup key', async () => {
    const dir = '/fixtures/botmux-webhook-life-1';
    const [a, b] = await Promise.all([
      beginWebhookLifecycleFiring('conn_1', 'alert_1', dir),
      beginWebhookLifecycleFiring('conn_1', 'alert_1', dir),
    ]);
    expect([a.action, b.action].sort()).toEqual(['create', 'creating']);
    const create = a.action === 'create' ? a : b;
    const active = await activateWebhookLifecycleGroup('conn_1', 'alert_1', create.record.lifecycleId, 'oc_1', { creatorLarkAppId: 'app1' }, dir);
    expect(active.status).toBe('active');
    expect((await beginWebhookLifecycleFiring('conn_1', 'alert_1', dir)).action).toBe('reuse');
  });

  it('marks creating records as pending resolved and resolves after activation', async () => {
    const dir = '/fixtures/botmux-webhook-life-2';
    const create = await beginWebhookLifecycleFiring('conn_1', 'alert_2', dir);
    expect(create.action).toBe('create');
    const resolved = await resolveWebhookLifecycleGroup('conn_1', 'alert_2', dir);
    expect(resolved.action).toBe('pending');

    const activated = await activateWebhookLifecycleGroup('conn_1', 'alert_2', create.record.lifecycleId, 'oc_2', {}, dir);
    expect(activated.status).toBe('pending_resolved');
    expect(listWebhookLifecycleRecords({}, dir)[0]).toMatchObject({ status: 'resolved', chatId: 'oc_2' });
  });

  it('removes failed creating records so a later firing can retry', async () => {
    const dir = '/fixtures/botmux-webhook-life-3';
    const create = await beginWebhookLifecycleFiring('conn_1', 'alert_3', dir);
    expect(create.action).toBe('create');
    await failWebhookLifecycleGroup('conn_1', 'alert_3', create.record.lifecycleId, dir);
    expect(listWebhookLifecycleRecords({}, dir)).toEqual([]);
    expect((await beginWebhookLifecycleFiring('conn_1', 'alert_3', dir)).action).toBe('create');
  });

  it('reclaims stale creating records', async () => {
    const dir = '/fixtures/botmux-webhook-life-4';
    const create = await beginWebhookLifecycleFiring('conn_1', 'alert_4', dir);
    expect(create.action).toBe('create');
    const fp = join(dir, 'webhook-lifecycle.json');
    const raw = JSON.parse(readFileSync(fp, 'utf-8'));
    raw.records[0].creatingExpiresAt = '2020-01-01T00:00:00.000Z';
    writeFileSync(fp, JSON.stringify(raw, null, 2) + '\n');

    const retry = await beginWebhookLifecycleFiring('conn_1', 'alert_4', dir);
    expect(retry.action).toBe('create');
    expect(retry.record.lifecycleId).not.toBe(create.record.lifecycleId);
  });
});
