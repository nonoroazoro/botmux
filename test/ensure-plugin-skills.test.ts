import { resetMemoryFs } from './helpers/memory-fs/index.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('node:fs', async () => (await import('./helpers/memory-fs/index.js')).fs);
vi.mock('node:fs/promises', async () => (await import('./helpers/memory-fs/index.js')).fs.promises);

// Reset the in-memory fixture tree between cases; no host directories are created.
beforeEach(() => {
  resetMemoryFs({
    '/fixtures/plugin-skills-1': null,
    '/fixtures/global-skills-2': null,
  });
});
import { rmSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensurePluginSkills } from '../src/skills/installer.js';
import { BUILTIN_SKILLS, ASK_SKILL_NAME } from '../src/skills/definitions.js';

describe('ensurePluginSkills', () => {
  let dir: string;
  beforeEach(() => { dir = '/fixtures/plugin-skills-1'; });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('writes a valid .claude-plugin/plugin.json manifest named botmux', () => {
    ensurePluginSkills('claude-code', dir);
    const manifestFile = join(dir, '.claude-plugin', 'plugin.json');
    expect(existsSync(manifestFile)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf-8'));
    expect(manifest.name).toBe('botmux');
  });

  it('writes every built-in skill to skills/<name>/SKILL.md', () => {
    ensurePluginSkills('claude-code', dir);
    for (const skill of BUILTIN_SKILLS) {
      const skillFile = join(dir, 'skills', skill.name, 'SKILL.md');
      expect(existsSync(skillFile)).toBe(true);
      expect(readFileSync(skillFile, 'utf-8')).toBe(skill.content);
    }
  });

  it('is idempotent', () => {
    ensurePluginSkills('claude-code', dir);
    const sample = join(dir, 'skills', BUILTIN_SKILLS[0].name, 'SKILL.md');
    const first = readFileSync(sample, 'utf-8');
    expect(() => ensurePluginSkills('claude-code', dir)).not.toThrow();
    expect(readFileSync(sample, 'utf-8')).toBe(first);
  });

  it('does nothing when pluginDir is undefined', () => {
    expect(() => ensurePluginSkills('claude-code', undefined)).not.toThrow();
  });
});
