import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_SOUL_BYTES,
  resetSoul,
  resolveSoul,
  writeSoul,
} from '../../../src/core/personality/index.js';
import { makeTestTempDir } from '../../helpers/test-temp-dir.js';

const tempRoots: string[] = [];

function tempDataDir(): string {
  const root = makeTestTempDir('botmux-soul-');
  tempRoots.push(root);
  return join(root, 'data');
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('soul store', () => {
  it('uses the built-in Soul until a custom Soul is saved', () => {
    const dataDir = tempDataDir();
    const initial = resolveSoul('cli_bot', dataDir);
    expect(initial.source).toBe('default');
    expect(initial.content).toContain('# Default Soul');

    const custom = writeSoul('cli_bot', '# Custom Soul\n\nPrefer evidence.', dataDir);
    expect(custom.source).toBe('custom');
    expect(resolveSoul('cli_bot', dataDir)).toEqual(custom);
    const soulPath = join(dataDir, 'owner', 'souls', 'cli_bot.md');
    expect(readFileSync(soulPath, 'utf8'))
      .toBe('# Custom Soul\n\nPrefer evidence.\n');
    if (process.platform !== 'win32') expect(statSync(soulPath).mode & 0o777).toBe(0o600);
  });

  it('resets by deleting only the custom override', () => {
    const dataDir = tempDataDir();
    const before = writeSoul('cli_bot', 'Custom', dataDir);
    const after = resetSoul('cli_bot', dataDir);
    expect(after.source).toBe('default');
    expect(after.revision).not.toBe(before.revision);
  });

  it('rejects empty, oversized, and unsafe inputs', () => {
    const dataDir = tempDataDir();
    expect(() => writeSoul('cli_bot', '   ', dataDir)).toThrow('soul_content_required');
    expect(() => writeSoul('cli_bot', 'x'.repeat(MAX_SOUL_BYTES + 1), dataDir))
      .toThrow('soul_content_too_large');
    expect(() => writeSoul('../other', 'unsafe', dataDir)).toThrow('invalid_bot_id');
  });

  it('falls back to the built-in Soul when the custom file is invalid and remains resettable', () => {
    const dataDir = tempDataDir();
    const path = join(dataDir, 'owner', 'souls', 'cli_bot.md');
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, '   ', { mode: 0o600 });

    const resolved = resolveSoul('cli_bot', dataDir);
    expect(resolved.source).toBe('default');
    expect(resolved.content).toContain('# Default Soul');
    expect(resolved.customError).toBe('soul_content_required');

    expect(resetSoul('cli_bot', dataDir)).not.toHaveProperty('customError');
  });

});
