import { resetMemoryFs } from './helpers/memory-fs/index.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async () => (await import('./helpers/memory-fs/index.js')).fs);
vi.mock('node:fs/promises', async () => (await import('./helpers/memory-fs/index.js')).fs.promises);

// Reset the in-memory fixture tree between cases; no host directories are created.
beforeEach(() => {
  resetMemoryFs({
    '/fixtures/botmux-forward-followup-1': null,
  });
});
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  listForwardFollowups,
  putForwardFollowup,
  removeForwardFollowup,
} from '../src/im/lark/forward-followup-store.js';

describe('forward-followup-store', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = '/fixtures/botmux-forward-followup-1';
    vi.stubEnv('SESSION_DATA_DIR', dataDir);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('persists, replaces, and removes pending payloads by seed message id', () => {
    putForwardFollowup('app-1', {
      messageId: 'seed-1',
      dueAt: 1_000,
      payload: { kind: 'seed' },
    });
    putForwardFollowup('app-1', {
      messageId: 'seed-1',
      dueAt: 2_000,
      payload: { kind: 'paired' },
    });

    expect(listForwardFollowups('app-1')).toEqual([{
      messageId: 'seed-1',
      dueAt: 2_000,
      payload: { kind: 'paired' },
    }]);

    removeForwardFollowup('app-1', 'seed-1');
    expect(listForwardFollowups('app-1')).toEqual([]);
  });

  it('isolates records by app', () => {
    putForwardFollowup('app-1', { messageId: 'seed-1', dueAt: 1_000, payload: {} });
    expect(listForwardFollowups('app-2')).toEqual([]);
  });
});
