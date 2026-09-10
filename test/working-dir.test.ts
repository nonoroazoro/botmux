import { resetMemoryFs } from './helpers/memory-fs/index.js';
import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, beforeEach, vi } from 'vitest';

// Store and rendering behavior uses a fresh in-memory filesystem.
vi.mock('node:fs', async () => (await import('./helpers/memory-fs/index.js')).fs);
vi.mock('node:fs/promises', async () => (await import('./helpers/memory-fs/index.js')).fs.promises);
beforeEach(() => {
  resetMemoryFs({ '/fixtures': null });
});
import { configuredWorkingDirs, invalidWorkingDirs, parseWorkingDirList } from '../src/utils/working-dir.js';
import { validateWorkingDir } from '../src/core/working-dir.js';

describe('working-dir utils', () => {
  it('parses comma-separated strings and arrays', () => {
    expect(parseWorkingDirList('/a, /b,,/c')).toEqual(['/a', '/b', '/c']);
    expect(parseWorkingDirList(['/a, /b', ' /c '])).toEqual(['/a', '/b', '/c']);
    expect(parseWorkingDirList(undefined)).toEqual([]);
  });

  it('dedupes configured dirs by resolved path', () => {
    const cwd = process.cwd();
    expect(configuredWorkingDirs({ workingDir: '., ' + cwd })).toEqual(['.']);
  });

  it('reports missing paths and files as invalid dirs', () => {
    const dir = '/fixtures';
    const file = join(dir, 'not-a-dir');
    const missing = join(dir, 'missing');
    writeFileSync(file, 'x');

    expect(invalidWorkingDirs({ workingDir: [dir, file, missing] })).toEqual([
      resolve(file),
      resolve(missing),
    ]);
  });
});

describe('validateWorkingDir', () => {
  it('rejects a missing path by default and does not create it', () => {
    const dir = '/fixtures';
    const missing = join(dir, 'missing');

    const r = validateWorkingDir(missing);
    expect(r.ok).toBe(false);
    expect(existsSync(missing)).toBe(false);
  });

  it('creates a missing path with autoCreate and flags created', () => {
    const dir = '/fixtures';
    const missing = join(dir, 'nested', 'deep');

    const r = validateWorkingDir(missing, undefined, { autoCreate: true });
    expect(r).toEqual({ ok: true, resolvedPath: resolve(missing), created: true });
    expect(existsSync(missing)).toBe(true);
  });

  it('does not flag created for an existing dir even with autoCreate', () => {
    const dir = '/fixtures';

    const r = validateWorkingDir(dir, undefined, { autoCreate: true });
    expect(r).toEqual({ ok: true, resolvedPath: resolve(dir) });
  });

  it('rejects an existing file in both modes', () => {
    const dir = '/fixtures';
    const file = join(dir, 'a-file');
    writeFileSync(file, 'x');

    expect(validateWorkingDir(file).ok).toBe(false);
    expect(validateWorkingDir(file, undefined, { autoCreate: true }).ok).toBe(false);
  });
});
