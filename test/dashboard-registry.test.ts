import { resetMemoryFs } from './helpers/memory-fs/index.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('node:fs', async () => (await import('./helpers/memory-fs/index.js')).fs);
vi.mock('node:fs/promises', async () => (await import('./helpers/memory-fs/index.js')).fs.promises);

// Reset the in-memory fixture tree between cases; no host directories are created.
beforeEach(() => {
  resetMemoryFs({
    '/fixtures/botmux-reg-1': null,
    '/fixtures/botmux-reg-empty-2': null,
  });
});
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DaemonRegistry } from '../src/dashboard/registry.js';

let dir: string;
beforeEach(() => {
  dir = '/fixtures/botmux-reg-1';
  mkdirSync(dir, { recursive: true });
});
afterEach(() => {
  vi.useRealTimers();
  rmSync(dir, { recursive: true, force: true });
});

function writeDesc(larkAppId: string, port: number, hbAgo = 0, bootInstanceId?: string) {
  writeFileSync(join(dir, `${larkAppId}.json`), JSON.stringify({
    larkAppId, botName: larkAppId, botIndex: 0, ipcPort: port,
    pid: 1, startedAt: Date.now(), lastHeartbeat: Date.now() - hbAgo,
    ...(bootInstanceId ? { bootInstanceId } : {}),
  }));
}

describe('DaemonRegistry', () => {
  it('reads existing descriptors on start', async () => {
    const bootInstanceId = 'B'.repeat(43);
    writeDesc('appA', 7892, 0, bootInstanceId);
    const reg = new DaemonRegistry(dir);
    await reg.start();
    expect(reg.list().length).toBe(1);
    expect(reg.getByAppId('appA')?.ipcPort).toBe(7892);
    expect(reg.getByAppId('appA')?.bootInstanceId).toBe(bootInstanceId);
    reg.stop();
  });

  it('treats descriptor older than 90s as stale (excluded)', async () => {
    writeDesc('appOld', 7893, 95_000);
    const reg = new DaemonRegistry(dir);
    await reg.start();
    expect(reg.getByAppId('appOld')).toBeUndefined();
    reg.stop();
  });

  it('returns empty list when directory is missing or empty', async () => {
    const empty = '/fixtures/botmux-reg-empty-2';
    const reg = new DaemonRegistry(empty);
    await reg.start();
    expect(reg.list()).toEqual([]);
    reg.stop();
    rmSync(empty, { recursive: true, force: true });
  });

  it('polls descriptors so missed fs.watch heartbeat updates do not mark daemons stale', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    writeDesc('appA', 7892);

    const reg = new DaemonRegistry(dir, { refreshIntervalMs: 1_000 });
    await reg.start();

    // Simulate a platform where fs.watch misses the daemon's atomic descriptor rewrite.
    (reg as unknown as { watcher?: { close(): void } }).watcher?.close();

    expect(reg.list().length).toBe(1);

    vi.setSystemTime(95_000);
    expect(reg.list()).toEqual([]);

    writeDesc('appA', 7892);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(reg.list().length).toBe(1);
    expect(reg.getByAppId('appA')?.ipcPort).toBe(7892);
    reg.stop();
  });
});
