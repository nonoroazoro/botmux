import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ensurePluginSkills, removeGlobalBotmuxSkills } from '../src/skills/installer.js';
import { BUILTIN_SKILLS, ASK_SKILL_NAME, RETIRED_SKILL_NAMES } from '../src/skills/definitions.js';

describe('ensurePluginSkills', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'plugin-skills-')); });
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

  it('keeps botmux-goal-ask aligned with the GoalInputs answer shape', () => {
    const skill = BUILTIN_SKILLS.find((s) => s.name === 'botmux-goal-ask');
    expect(skill?.content).toContain('"from": "human"');
    expect(skill?.content).toContain('"name": "answer"');
    expect(skill?.content).not.toContain('from: "human/answer"');
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

describe('removeGlobalBotmuxSkills', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'global-skills-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const seed = (name: string) => {
    mkdirSync(join(dir, name), { recursive: true });
    writeFileSync(join(dir, name, 'SKILL.md'), 'x', 'utf-8');
  };

  it('removes every botmux-prefixed skill and preserves user skills', () => {
    for (const s of BUILTIN_SKILLS) seed(s.name);
    seed(ASK_SKILL_NAME);
    for (const r of RETIRED_SKILL_NAMES) seed(r);
    // Remove skills left by versions unknown to this checkout.
    seed('botmux-handoff');
    seed('botmux-some-future-skill');
    seed('my-own-skill');

    removeGlobalBotmuxSkills(dir);

    for (const s of BUILTIN_SKILLS) expect(existsSync(join(dir, s.name))).toBe(false);
    expect(existsSync(join(dir, ASK_SKILL_NAME))).toBe(false);
    for (const r of RETIRED_SKILL_NAMES) expect(existsSync(join(dir, r))).toBe(false);
    expect(existsSync(join(dir, 'botmux-handoff'))).toBe(false);
    expect(existsSync(join(dir, 'botmux-some-future-skill'))).toBe(false);
    // Preserve skills not owned by botmux.
    expect(existsSync(join(dir, 'my-own-skill'))).toBe(true);
  });

  it('does nothing for a missing or undefined directory', () => {
    expect(() => removeGlobalBotmuxSkills(join(dir, 'nope'))).not.toThrow();
    expect(() => removeGlobalBotmuxSkills(undefined)).not.toThrow();
  });

  it('removes botmux skills recreated by a restart race on a second scan', () => {
    // First cleanup pass.
    seed('botmux-send');
    removeGlobalBotmuxSkills(dir);
    expect(existsSync(join(dir, 'botmux-send'))).toBe(false);

    // Simulate an old build recreating global skills after cleanup.
    seed('botmux-send');
    seed('botmux-handoff');
    seed('my-own-skill');
    expect(existsSync(join(dir, 'botmux-send'))).toBe(true);

    // A second pass removes botmux residue and preserves user content.
    removeGlobalBotmuxSkills(dir);
    expect(existsSync(join(dir, 'botmux-send'))).toBe(false);
    expect(existsSync(join(dir, 'botmux-handoff'))).toBe(false);
    expect(existsSync(join(dir, 'my-own-skill'))).toBe(true);
  });
});
