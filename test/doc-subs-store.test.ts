import { resetMemoryFs } from './helpers/memory-fs/index.js';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async () => (await import('./helpers/memory-fs/index.js')).fs);
vi.mock('node:fs/promises', async () => (await import('./helpers/memory-fs/index.js')).fs.promises);

// Reset the in-memory fixture tree between cases; no host directories are created.
beforeEach(() => {
  resetMemoryFs({
    '/fixtures/botmux-doc-subs-1': null,
  });
});

import {
  putDocSubscription,
  getDocSubscription,
  removeDocSubscription,
  listDocSubscriptionsForSession,
  listAllDocSubscriptions,
  setCommentTriggerMode,
  type DocSubscription,
} from '../src/services/doc-subs-store.js';

let dataDir = '';
const APP_A = 'cli_appA';
const APP_B = 'cli_appB';

function sub(over: Partial<DocSubscription> = {}): DocSubscription {
  return {
    fileToken: 'doccnFILE1',
    fileType: 'docx',
    sessionAnchor: 'om_anchor1',
    scope: 'thread',
    chatId: 'oc_chat1',
    commentTriggerMode: 'mention-only',
    createdAt: 1_700_000_000_000,
    ...over,
  };
}

beforeEach(() => { dataDir = '/fixtures/botmux-doc-subs-1'; });
afterEach(() => { if (dataDir) { rmSync(dataDir, { recursive: true, force: true }); dataDir = ''; } });

describe('doc-subs-store', () => {
  it('returns null / empty when nothing stored', () => {
    expect(getDocSubscription(dataDir, APP_A, 'doccnX')).toBeNull();
    expect(listAllDocSubscriptions(dataDir, APP_A)).toEqual([]);
    expect(listDocSubscriptionsForSession(dataDir, APP_A, 'om_x')).toEqual([]);
  });

  it('put → get round-trips', () => {
    putDocSubscription(dataDir, APP_A, sub());
    expect(getDocSubscription(dataDir, APP_A, 'doccnFILE1')).toMatchObject({ fileToken: 'doccnFILE1', fileType: 'docx', sessionAnchor: 'om_anchor1' });
  });

  it('one document binds to one session: re-put rebinds and reports previous', () => {
    putDocSubscription(dataDir, APP_A, sub({ sessionAnchor: 'om_old' }));
    const { previous } = putDocSubscription(dataDir, APP_A, sub({ sessionAnchor: 'om_new' }));
    expect(previous?.sessionAnchor).toBe('om_old');
    expect(getDocSubscription(dataDir, APP_A, 'doccnFILE1')?.sessionAnchor).toBe('om_new');
    // single key — not duplicated
    expect(listAllDocSubscriptions(dataDir, APP_A)).toHaveLength(1);
  });

  it('lists a session\'s subscriptions; one session can hold many docs', () => {
    putDocSubscription(dataDir, APP_A, sub({ fileToken: 'd1', sessionAnchor: 'om_s' }));
    putDocSubscription(dataDir, APP_A, sub({ fileToken: 'd2', sessionAnchor: 'om_s' }));
    putDocSubscription(dataDir, APP_A, sub({ fileToken: 'd3', sessionAnchor: 'om_other' }));
    const forS = listDocSubscriptionsForSession(dataDir, APP_A, 'om_s').map(s => s.fileToken).sort();
    expect(forS).toEqual(['d1', 'd2']);
  });

  it('remove returns the removed entry then it is gone', () => {
    putDocSubscription(dataDir, APP_A, sub());
    const removed = removeDocSubscription(dataDir, APP_A, 'doccnFILE1');
    expect(removed?.fileToken).toBe('doccnFILE1');
    expect(getDocSubscription(dataDir, APP_A, 'doccnFILE1')).toBeNull();
    expect(removeDocSubscription(dataDir, APP_A, 'doccnFILE1')).toBeUndefined();
  });

  it('setCommentTriggerMode flips an existing sub; misses return false', () => {
    putDocSubscription(dataDir, APP_A, sub({ commentTriggerMode: 'mention-only' }));
    expect(setCommentTriggerMode(dataDir, APP_A, 'doccnFILE1', 'all')).toBe(true);
    expect(getDocSubscription(dataDir, APP_A, 'doccnFILE1')?.commentTriggerMode).toBe('all');
    expect(setCommentTriggerMode(dataDir, APP_A, 'missing', 'all')).toBe(false);
  });

  it('per-app isolation: APP_B never sees APP_A entries', () => {
    putDocSubscription(dataDir, APP_A, sub());
    expect(getDocSubscription(dataDir, APP_B, 'doccnFILE1')).toBeNull();
    expect(listAllDocSubscriptions(dataDir, APP_B)).toEqual([]);
  });
});
