import { resetMemoryFs } from './helpers/memory-fs/index.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('node:fs', async () => (await import('./helpers/memory-fs/index.js')).fs);
vi.mock('node:fs/promises', async () => (await import('./helpers/memory-fs/index.js')).fs.promises);

// Reset the in-memory fixture tree between cases; no host directories are created.
beforeEach(() => {
  resetMemoryFs({
    '/fixtures/ask-skill-1': null,
  });
});
import { rmSync, existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureAskSkill } from '../src/skills/installer.js';
import { ASK_SKILL, ASK_SKILL_NAME } from '../src/skills/definitions.js';

// Prefer the hook and keep the skill only as a fallback for CLIs without it.
describe('ensureAskSkill', () => {
  let dir: string;
  beforeEach(() => { dir = '/fixtures/ask-skill-1'; });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const skillFile = () => join(dir, ASK_SKILL_NAME, 'SKILL.md');

  it('writes botmux-ask/SKILL.md when install is true', () => {
    ensureAskSkill('codex', dir, true);
    expect(existsSync(skillFile())).toBe(true);
    expect(readFileSync(skillFile(), 'utf-8')).toBe(ASK_SKILL);
  });

  it('removes botmux-ask when the hook takes over', () => {
    mkdirSync(join(dir, ASK_SKILL_NAME), { recursive: true });
    writeFileSync(skillFile(), ASK_SKILL, 'utf-8');
    ensureAskSkill('claude-code', dir, false);
    expect(existsSync(join(dir, ASK_SKILL_NAME))).toBe(false);
  });

  it('does nothing when disabled and already absent', () => {
    expect(() => ensureAskSkill('claude-code', dir, false)).not.toThrow();
    expect(existsSync(join(dir, ASK_SKILL_NAME))).toBe(false);
  });

  it('does nothing when skillsDir is undefined', () => {
    expect(() => ensureAskSkill('cursor', undefined, true)).not.toThrow();
  });
});
