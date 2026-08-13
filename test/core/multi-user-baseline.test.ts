import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { syncMultiUserBaselineDirectory } from '../../src/core/multi-user-baseline.js';

const roots: string[] = [];

function fixture(): { root: string; source: string; target: string } {
  const root = mkdtempSync(join(tmpdir(), 'botmux-baseline-'));
  roots.push(root);
  const source = join(root, 'host', 'skills');
  const target = join(root, 'user', 'skills');
  mkdirSync(source, { recursive: true });
  return { root, source, target };
}

function addSkill(root: string, name: string, body = name): void {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), body);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('syncMultiUserBaselineDirectory', () => {
  it('links each baseline entry through the canonical source path', () => {
    const { root, source, target } = fixture();
    addSkill(source, 'bits');
    const lexicalSource = join(root, 'host-link');
    symlinkSync(join(root, 'host'), lexicalSource, 'dir');

    const result = syncMultiUserBaselineDirectory(join(lexicalSource, 'skills'), target);

    expect(result.linked).toEqual(['bits']);
    expect(readlinkSync(join(target, 'bits'))).toBe(join(realpathSync(source), 'bits'));
    expect(result.readonlyRoots).toEqual([realpathSync(source)]);
  });

  it('migrates the legacy whole-directory symlink into an overlay directory', () => {
    const { source, target } = fixture();
    addSkill(source, 'bits');
    mkdirSync(resolve(target, '..'), { recursive: true });
    symlinkSync(source, target, 'dir');

    syncMultiUserBaselineDirectory(source, target);

    expect(lstatSync(target).isDirectory()).toBe(true);
    expect(lstatSync(join(target, 'bits')).isSymbolicLink()).toBe(true);
  });

  it('preserves a user-owned same-named skill and fills other baseline skills', () => {
    const { source, target } = fixture();
    addSkill(source, 'bits', 'host');
    addSkill(source, 'meegle', 'host');
    addSkill(target, 'bits', 'user');

    const result = syncMultiUserBaselineDirectory(source, target);

    expect(result.preserved).toEqual(['bits']);
    expect(readFileSync(join(target, 'bits', 'SKILL.md'), 'utf8')).toBe('user');
    expect(lstatSync(join(target, 'meegle')).isSymbolicLink()).toBe(true);
  });

  it('merges ordered global sources while a secondary personal root overrides them', () => {
    const { root, source, target } = fixture();
    const commonSource = join(root, 'host', 'common-skills');
    const personalCommon = join(root, 'user', '.agents', 'skills');
    addSkill(source, 'bits', 'adapter');
    addSkill(source, 'shared', 'adapter');
    addSkill(commonSource, 'tea', 'common');
    addSkill(commonSource, 'shared', 'common');
    addSkill(personalCommon, 'tea', 'personal');

    const result = syncMultiUserBaselineDirectory(
      [source, commonSource],
      target,
      { overrideDirs: [personalCommon], targetRoot: join(root, 'user') },
    );

    expect(result.linked).toEqual(['bits', 'shared']);
    expect(result.preserved).toEqual(['tea']);
    expect(readFileSync(join(target, 'shared', 'SKILL.md'), 'utf8')).toBe('adapter');
    expect(readFileSync(join(personalCommon, 'tea', 'SKILL.md'), 'utf8')).toBe('personal');
  });

  it('links executable and plugin metadata files only when files are enabled', () => {
    const { source, target } = fixture();
    writeFileSync(join(source, 'tea'), 'binary');
    writeFileSync(join(source, 'marketplace.json'), '{}');

    syncMultiUserBaselineDirectory(source, target);
    expect(existsSync(join(target, 'tea'))).toBe(false);

    const result = syncMultiUserBaselineDirectory(source, target, { includeFiles: true });
    expect(result.linked).toEqual(['marketplace.json', 'tea']);
    expect(lstatSync(join(target, 'tea')).isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(target, 'tea'))).toBe(join(realpathSync(source), 'tea'));
  });

  it('adds new baseline entries and removes only stale managed links', () => {
    const { source, target } = fixture();
    addSkill(source, 'bits');
    syncMultiUserBaselineDirectory(source, target);
    addSkill(source, 'meegle');
    rmSync(join(source, 'bits'), { recursive: true });
    addSkill(target, 'personal');

    const result = syncMultiUserBaselineDirectory(source, target);

    expect(result.linked).toEqual(['meegle']);
    expect(result.removed).toEqual(['bits']);
    expect(readFileSync(join(target, 'personal', 'SKILL.md'), 'utf8')).toBe('personal');
  });

  it('keeps a user replacement after a managed baseline link is removed', () => {
    const { source, target } = fixture();
    addSkill(source, 'bits', 'host');
    syncMultiUserBaselineDirectory(source, target);
    unlinkSync(join(target, 'bits'));
    addSkill(target, 'bits', 'user');
    rmSync(join(source, 'bits'), { recursive: true });

    const result = syncMultiUserBaselineDirectory(source, target);

    expect(result.removed).toEqual([]);
    expect(readFileSync(join(target, 'bits', 'SKILL.md'), 'utf8')).toBe('user');
  });

  it('does not follow a forged manifest symlink when rewriting its marker', () => {
    const { root, source, target } = fixture();
    addSkill(source, 'bits');
    mkdirSync(target, { recursive: true });
    const outside = join(root, 'outside.json');
    writeFileSync(outside, 'keep');
    symlinkSync(outside, join(target, '.botmux-baseline.json'));

    expect(() => syncMultiUserBaselineDirectory(source, target)).toThrow();
    expect(readFileSync(outside, 'utf8')).toBe('keep');
  });

  it('is idempotent across repeated cold starts', () => {
    const { source, target } = fixture();
    addSkill(source, 'bits');
    const first = syncMultiUserBaselineDirectory(source, target);
    const second = syncMultiUserBaselineDirectory(source, target);

    expect(first.linked).toEqual(['bits']);
    expect(second).toMatchObject({ linked: [], preserved: [], removed: [] });
    expect(readlinkSync(join(target, 'bits'))).toBe(join(realpathSync(source), 'bits'));
  });

  it('does not claim or replace a pre-existing untracked symlink', () => {
    const { root, source, target } = fixture();
    addSkill(source, 'bits', 'host');
    const personal = join(root, 'personal-bits');
    addSkill(personal, '.', 'personal');
    mkdirSync(target, { recursive: true });
    symlinkSync(personal, join(target, 'bits'), 'dir');

    const result = syncMultiUserBaselineDirectory(source, target);

    expect(result.preserved).toEqual(['bits']);
    expect(readlinkSync(join(target, 'bits'))).toBe(personal);
  });

  it('refuses an intermediate target symlink that escapes the isolated home', () => {
    const { root, source } = fixture();
    addSkill(source, 'bits');
    const userHome = join(root, 'user');
    const outside = join(root, 'outside');
    mkdirSync(userHome, { recursive: true });
    mkdirSync(outside, { recursive: true });
    symlinkSync(outside, join(userHome, '.local'), 'dir');

    const result = syncMultiUserBaselineDirectory(
      source,
      join(userHome, '.local', 'bin'),
      { includeFiles: true, targetRoot: userHome },
    );

    expect(result.linked).toEqual([]);
    expect(result.preserved).toEqual([join(userHome, '.local', 'bin')]);
  });
});
