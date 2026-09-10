import { resetMemoryFs } from './helpers/memory-fs/index.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async () => (await import('./helpers/memory-fs/index.js')).fs);
vi.mock('node:fs/promises', async () => (await import('./helpers/memory-fs/index.js')).fs.promises);

// Reset the in-memory fixture tree between cases; no host directories are created.
beforeEach(() => {
  resetMemoryFs({
    '/fixtures/botmux-skill-data-1': null,
  });
});
import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { readSessionSkillManifest, writeSessionSkillManifest } from '../src/core/skills/manifest-store.js';
import type { SessionSkillManifest } from '../src/core/skills/types.js';

describe('session skill manifest store', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = '/fixtures/botmux-skill-data-1';
    vi.stubEnv('SESSION_DATA_DIR', dataDir);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('writes and reads a manifest by session id', () => {
    const manifest: SessionSkillManifest = {
      sessionId: 's1',
      cliId: 'codex',
      workingDir: '/repo',
      policyMode: 'priority',
      prioritySkills: [],
      diagnostics: [],
      generatedAt: '2026-06-14T00:00:00.000Z',
    };

    writeSessionSkillManifest(manifest);

    expect(readSessionSkillManifest('s1')).toEqual(manifest);
  });
});
