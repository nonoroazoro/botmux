import { resetMemoryFs } from './helpers/memory-fs/index.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('node:fs', async () => (await import('./helpers/memory-fs/index.js')).fs);
vi.mock('node:fs/promises', async () => (await import('./helpers/memory-fs/index.js')).fs.promises);

// Reset the in-memory fixture tree between cases; no host directories are created.
beforeEach(() => {
  resetMemoryFs({
    '/fixtures/wb-skill-1': null,
  });
});
import { rmSync, existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureWhiteboardSkill } from '../src/skills/installer.js';
import { WHITEBOARD_SKILL, WHITEBOARD_SKILL_NAME } from '../src/skills/definitions.js';

// Whiteboard support is opt-in. Install or remove its skill with the feature.
describe('ensureWhiteboardSkill', () => {
  let dir: string;
  beforeEach(() => { dir = '/fixtures/wb-skill-1'; });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const skillFile = () => join(dir, WHITEBOARD_SKILL_NAME, 'SKILL.md');

  it('writes botmux-whiteboard/SKILL.md when enabled', () => {
    ensureWhiteboardSkill('claude-code', dir, true);
    expect(existsSync(skillFile())).toBe(true);
    expect(readFileSync(skillFile(), 'utf-8')).toBe(WHITEBOARD_SKILL);
  });

  it('removes an existing whiteboard skill when disabled', () => {
    mkdirSync(join(dir, WHITEBOARD_SKILL_NAME), { recursive: true });
    writeFileSync(skillFile(), WHITEBOARD_SKILL, 'utf-8');
    ensureWhiteboardSkill('claude-code', dir, false);
    expect(existsSync(join(dir, WHITEBOARD_SKILL_NAME))).toBe(false);
  });

  it('does nothing when disabled and already absent', () => {
    expect(() => ensureWhiteboardSkill('codex', dir, false)).not.toThrow();
    expect(existsSync(join(dir, WHITEBOARD_SKILL_NAME))).toBe(false);
  });

  it('is idempotent when enabled', () => {
    ensureWhiteboardSkill('claude-code', dir, true);
    expect(() => ensureWhiteboardSkill('claude-code', dir, true)).not.toThrow();
    expect(readFileSync(skillFile(), 'utf-8')).toBe(WHITEBOARD_SKILL);
  });

  it('removes the skill when the feature changes from enabled to disabled', () => {
    ensureWhiteboardSkill('claude-code', dir, true);
    expect(existsSync(skillFile())).toBe(true);
    ensureWhiteboardSkill('claude-code', dir, false);
    expect(existsSync(join(dir, WHITEBOARD_SKILL_NAME))).toBe(false);
  });

  it('does nothing when the CLI has no skills directory', () => {
    expect(() => ensureWhiteboardSkill('cursor', undefined, true)).not.toThrow();
  });
});
