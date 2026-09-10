import { resetMemoryFs } from './helpers/memory-fs/index.js';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('node:fs', async () => (await import('./helpers/memory-fs/index.js')).fs);
vi.mock('node:fs/promises', async () => (await import('./helpers/memory-fs/index.js')).fs.promises);

// Reset the in-memory fixture tree between cases; no host directories are created.
beforeEach(() => {
  resetMemoryFs({
    '/fixtures/botmux-host-command-context-1': null,
  });
});
import { isManagedAgentHostCommandContext } from '../src/platform/host-command-context.js';

const roots: string[] = [];

function tempDataDir(): string {
  const root = '/fixtures/botmux-host-command-context-1';
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('managed agent host-command guard', () => {
  it('recognizes detached session environment hints', () => {
    const dataDir = tempDataDir();
    expect(isManagedAgentHostCommandContext({
      dataDir,
      env: { BOTMUX_SESSION_ID: 'session-1' },
    })).toBe(true);
    expect(isManagedAgentHostCommandContext({ dataDir, env: {} })).toBe(false);
  });

  it('recognizes a daemon PID marker even when session env was scrubbed', () => {
    const dataDir = tempDataDir();
    const markers = join(dataDir, '.botmux-cli-pids');
    mkdirSync(markers, { recursive: true });
    writeFileSync(join(markers, String(process.pid)), 'session-from-marker');

    expect(isManagedAgentHostCommandContext({
      dataDir,
      env: {},
      startPid: process.pid,
    })).toBe(true);
  });
});
