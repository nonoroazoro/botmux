import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeTestTempDir } from './helpers/test-temp-dir.js';

const CLI_PATH = join(__dirname, '..', 'src', 'cli.ts');
const PROJECT_ROOT = join(__dirname, '..');

let home: string;

beforeAll(() => {
  home = makeTestTempDir('botmux-update-alias-');
});

afterAll(() => {
  rmSync(home, { recursive: true, force: true });
});

function runCli(command: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ['--import', 'tsx', CLI_PATH, command], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      SESSION_DATA_DIR: join(home, 'data'),
      PATH: '',
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('botmux update alias', () => {
  it('behaves exactly like upgrade', () => {
    const upgrade = runCli('upgrade');
    const update = runCli('update');

    expect(upgrade.status).toBe(2);
    expect(upgrade.stderr).toContain('Update is disabled for this fork');
    expect(update.status).toBe(upgrade.status);
    expect(update.stdout).toBe(upgrade.stdout);
    expect(update.stderr).toContain('Update is disabled for this fork');
  });

  it('documents the alias in help', () => {
    const help = runCli('--help');

    expect(help.status).toBe(0);
    expect(help.stdout).toContain('upgrade     Self-update is disabled for this fork (alias: update)');
  });
});
