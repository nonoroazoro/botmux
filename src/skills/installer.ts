import { mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { atomicWriteFileSync } from '../utils/atomic-write.js';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { logger } from '../utils/logger.js';
import { BUILTIN_SKILLS, ASK_SKILL, ASK_SKILL_NAME, WHITEBOARD_SKILL, WHITEBOARD_SKILL_NAME } from './definitions.js';

// This module only manages botmux-owned bridge/ask skills. User-defined skills
// live in src/core/skills/* and services/skill-registry-store.ts so their
// lifecycle stays independent of any specific CLI's global skill directory.

function expandHome(p: string): string {
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : p;
}

/** Claude Code plugin manifest written to `{pluginDir}/.claude-plugin/plugin.json`.
 *  `name` is the only required field; it namespaces the bundled skills. */
const PLUGIN_MANIFEST = JSON.stringify({
  name: 'botmux',
  description: 'Built-in botmux Lark bridge skills injected per session through --plugin-dir without modifying global Claude skills.',
  version: '1.0.0',
  author: { name: 'botmux' },
}, null, 2) + '\n';

/**
 * Materialise the built-in skills as a Claude Code *plugin* under `pluginDir`,
 * so they can be injected per-session via `--plugin-dir` instead of polluting
 * the user's global `~/.claude/skills`. Writes:
 *   - {pluginDir}/.claude-plugin/plugin.json   (manifest, name='botmux')
 *   - {pluginDir}/skills/<name>/SKILL.md        (one per built-in skill)
 * Idempotent: writes only when content differs. Skill files are written by
 * reusing `ensureSkills` against `{pluginDir}/skills` (same flat layout).
 */
export function ensurePluginSkills(cliId: string, pluginDir: string | undefined): void {
  if (!pluginDir) return;
  const root = expandHome(pluginDir);
  const manifestDir = join(root, '.claude-plugin');
  const manifestFile = join(manifestDir, 'plugin.json');
  try {
    mkdirSync(manifestDir, { recursive: true });
    if (!(existsSync(manifestFile) && readFileSync(manifestFile, 'utf-8') === PLUGIN_MANIFEST)) {
      atomicWriteFileSync(manifestFile, PLUGIN_MANIFEST);
      logger.info(`[skills] Wrote plugin manifest for ${cliId} -> ${manifestFile}`);
    }
  } catch (err: any) {
    logger.warn(`[skills] Failed to write plugin manifest for ${cliId}: ${err.message}`);
  }
  ensureSkills(cliId, join(root, 'skills'));
}

/**
 * Install the ask fallback only when the CLI has no native question hook.
 */
export function ensureAskSkill(cliId: string, skillsDir: string | undefined, install: boolean): void {
  if (!skillsDir) return;
  const skillDir = join(expandHome(skillsDir), ASK_SKILL_NAME);
  const skillFile = join(skillDir, 'SKILL.md');
  try {
    if (install) {
      if (existsSync(skillFile) && readFileSync(skillFile, 'utf-8') === ASK_SKILL) return;
      mkdirSync(skillDir, { recursive: true });
      atomicWriteFileSync(skillFile, ASK_SKILL);
      logger.info(`[skills] Installed ${ASK_SKILL_NAME} fallback for ${cliId} -> ${skillFile}`);
    } else {
      if (!existsSync(skillDir)) return;
      rmSync(skillDir, { recursive: true, force: true });
      logger.info(`[skills] Removed ${ASK_SKILL_NAME}; native hook is active for ${cliId}`);
    }
  } catch (err: any) {
    logger.warn(`[skills] ensureAskSkill(${install}) failed for ${cliId}: ${err.message}`);
  }
}

/**
 * Install or remove the optional whiteboard skill from the current CLI.
 */
export function ensureWhiteboardSkill(cliId: string, skillsDir: string | undefined, install: boolean): void {
  if (!skillsDir) return;
  const skillDir = join(expandHome(skillsDir), WHITEBOARD_SKILL_NAME);
  const skillFile = join(skillDir, 'SKILL.md');
  try {
    if (install) {
      if (existsSync(skillFile) && readFileSync(skillFile, 'utf-8') === WHITEBOARD_SKILL) return;
      mkdirSync(skillDir, { recursive: true });
      atomicWriteFileSync(skillFile, WHITEBOARD_SKILL);
      logger.info(`[skills] Installed ${WHITEBOARD_SKILL_NAME} (whiteboard enabled) for ${cliId} -> ${skillFile}`);
    } else {
      if (!existsSync(skillDir)) return;
      rmSync(skillDir, { recursive: true, force: true });
      logger.info(`[skills] Removed ${WHITEBOARD_SKILL_NAME} (whiteboard disabled) for ${cliId}`);
    }
  } catch (err: any) {
    logger.warn(`[skills] ensureWhiteboardSkill(${install}) failed for ${cliId}: ${err.message}`);
  }
}

/**
 * Install (or refresh) the built-in skill library into the given CLI's skills
 * directory. Idempotent: writes only when content differs.
 *
 * Each skill becomes {skillsDir}/<name>/SKILL.md. Sub-directory layout
 * matches Claude Code / Gemini / OpenCode convention.
 */
export function ensureSkills(cliId: string, skillsDir: string | undefined): void {
  if (!skillsDir) return;
  const dir = expandHome(skillsDir);
  try { mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }

  for (const skill of BUILTIN_SKILLS) {
    const skillDir = join(dir, skill.name);
    const skillFile = join(skillDir, 'SKILL.md');
    try {
      if (existsSync(skillFile)) {
        const current = readFileSync(skillFile, 'utf-8');
        if (current === skill.content) continue;
      }
      mkdirSync(skillDir, { recursive: true });
      // Write atomically because multiple daemons may refresh a shared skill
      // directory while a CLI is reading it.
      atomicWriteFileSync(skillFile, skill.content);
      logger.info(`[skills] Installed ${skill.name} for ${cliId} -> ${skillFile}`);
    } catch (err: any) {
      logger.warn(`[skills] Failed to install ${skill.name} for ${cliId}: ${err.message}`);
    }
  }
}
