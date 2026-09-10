import { resetMemoryFs } from './helpers/memory-fs/index.js';
import { spawnSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('node:fs', async () => (await import('./helpers/memory-fs/index.js')).fs);
vi.mock('node:fs/promises', async () => (await import('./helpers/memory-fs/index.js')).fs.promises);

// Reset the in-memory fixture tree between cases; no host directories are created.
beforeEach(() => {
  resetMemoryFs({
    '/fixtures/botmux-capabilities-1': null,
  });
});
import {
  BOTMUX_CAPABILITIES_SCHEMA_VERSION,
  botmuxCapabilities,
  parseCapabilitiesArgs,
} from '../src/cli/capabilities.js';

describe('botmux capabilities contract', () => {
  const homes: string[] = [];

  afterEach(() => {
    for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
  });

  it('publishes the fixed machine-readable compatibility schema', () => {
    expect(botmuxCapabilities()).toEqual({
      schemaVersion: BOTMUX_CAPABILITIES_SCHEMA_VERSION,
      capabilities: {
        exact_chat_grant_v1: true,
        stable_app_dispatch_v1: true,
        stable_dispatch_acceptance_v1: true,
        managed_activation_v2: true,
      },
    });
  });

  it('accepts only the side-effect-free JSON form', () => {
    expect(parseCapabilitiesArgs(['--json'])).toEqual({ ok: true });
    expect(parseCapabilitiesArgs([])).toEqual({
      ok: false,
      error: '用法: botmux capabilities --json',
    });
    expect(parseCapabilitiesArgs(['--json', '--unknown'])).toEqual({
      ok: false,
      error: '用法: botmux capabilities --json',
    });
  });

  it('prints only the fixed JSON document and creates no runtime state', () => {
    const home = '/fixtures/botmux-capabilities-1';
    homes.push(home);
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', resolve('src/cli.ts'), 'capabilities', '--json'],
      {
        cwd: resolve('.'),
        env: { ...process.env, HOME: home },
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual(botmuxCapabilities());
    expect(readdirSync(home)).toEqual([]);
  });
});
