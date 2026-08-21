/**
 * Built-in skill injection mode for botmux bridge skills.
 * These skills reach a CLI that only supports a global
 * skills directory (codex/gemini/opencode/cursor/coco/traex/pi/oh-my-pi/mtr/
 * kiro-cli/genius/grok. This covers adapters with `skillsDir` and no per-session
 * `--plugin-dir` injection like Claude Code).
 *
 * Resolve modes from per-bot `skillInjection`, then machine-wide
 * `skills.builtinInjection`, then the `prompt` default:
 *
 *   - `global`: install the skill files into the CLI's shared global dir. Full
 *     native discovery, but the user's own standalone `codex`/`gemini` also sees
 *     them and can mis-fire. Right for hosts whose users never run the CLI by hand.
 *   - `prompt` (DEFAULT): don't touch the global dir; inject a compact skill
 *     catalog into the session prompt and let the model pull full instructions on
 *     demand via `botmux skill show <name>`. Session-scoped delivery does not leak.
 *   - `off`: neither files nor catalog; only routing hints and `botmux --help`.
 *
 * The install side (worker-pool `ensureCliSkills`) resolves per skills-DIR
 * because directories can be shared across CLIs. The decision
 * is "does ANY bot on this dir want global") and the prompt side resolves per
 * bot (the catalog is genuinely per-session). Both funnel through here so the
 * two channels never disagree.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readGlobalConfig } from '../global-config.js';
import { loadBotConfigs } from '../bot-registry.js';
import { createCliAdapterSync } from '../adapters/cli/registry.js';
import type { CliId } from '../adapters/cli/types.js';
import type { Locale } from '../i18n/index.js';
import { escapeXmlText } from '../utils/xml.js';
import {
  BUILTIN_SKILLS,
  ON_DEMAND_BUILTIN_SKILLS,
  ASK_SKILL, ASK_SKILL_NAME,
  WHITEBOARD_SKILL, WHITEBOARD_SKILL_NAME,
} from './definitions.js';

export type SkillInjectionMode = 'global' | 'prompt' | 'off';

/** Machine default when neither the bot nor config.json pins a value. */
export const DEFAULT_BUILTIN_SKILL_INJECTION: SkillInjectionMode = 'prompt';

export function isSkillInjectionMode(v: unknown): v is SkillInjectionMode {
  return v === 'global' || v === 'prompt' || v === 'off';
}

/** Machine-wide default (`skills.builtinInjection`, fallback `prompt`). */
export function globalBuiltinSkillInjectionDefault(): SkillInjectionMode {
  const v = readGlobalConfig().skills?.builtinInjection;
  return isSkillInjectionMode(v) ? v : DEFAULT_BUILTIN_SKILL_INJECTION;
}

/**
 * Resolve a per-bot override, then the machine default.
 */
export function resolveSkillInjectionMode(botOverride?: string): SkillInjectionMode {
  return isSkillInjectionMode(botOverride) ? botOverride : globalBuiltinSkillInjectionDefault();
}

/** Prompt-side resolution: the daemon knows the bot only by its larkAppId. */
export function resolveSkillInjectionModeForApp(larkAppId?: string): SkillInjectionMode {
  if (larkAppId) {
    try {
      const bot = loadBotConfigs().find((b) => b.larkAppId === larkAppId);
      if (bot) return resolveSkillInjectionMode(bot.skillInjection);
    } catch { /* fall through to machine default */ }
  }
  return globalBuiltinSkillInjectionDefault();
}

function expandHome(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}

/**
 * Install-side decision for a shared global skills dir: return true iff SOME
 * configured bot whose adapter writes to `skillsDir` resolves to `global`. Keyed
 * by the resolved dir (not cliId) because several CLIs share one dir, so a
 * `global` traex bot must keep the files a `prompt` coco bot would otherwise
 * sweep from the same ~/.trae/skills. Union semantics remain deterministic across the
 * per-bot daemons that each independently call this.
 */
export function shouldInstallGlobalSkills(skillsDir: string): boolean {
  const target = expandHome(skillsDir);
  try {
    for (const b of loadBotConfigs()) {
      if (resolveSkillInjectionMode(b.skillInjection) !== 'global') continue;
      let sd: string | undefined;
      try { sd = createCliAdapterSync(b.cliId, b.cliPathOverride).skillsDir; } catch { continue; }
      if (sd && expandHome(sd) === target) return true;
    }
  } catch { /* fall through */ }
  return false;
}

/**
 * How a CLI delivers botmux skills, for the dashboard control (and any other
 * consumer that must branch on skill-delivery capability):
 *  - `dynamic`: per-session `--plugin-dir` injection for the Claude family
 *    (claude-code), which sets `pluginDir`. Not configurable: it
 *    always inject dynamically, no global leak. The mode knobs don't apply.
 *  - `global`: a shared global skills directory for codex/gemini/opencode/
 *    cursor/coco/traex/pi/oh-my-pi/mtr/kiro-cli/genius/grok, where
 *    global|prompt|off applies.
 *  - `none`: the CLI has no skill mechanism (antigravity/hermes/
 *    codex-app), so there's nothing to configure.
 * Capability-based so future adapters are classified without per-adapter upkeep.
 */
export type SkillInjectionSupport = 'dynamic' | 'global' | 'none';
export function resolveSkillInjectionSupport(cliId: CliId, cliPathOverride?: string): SkillInjectionSupport {
  let ad;
  try { ad = createCliAdapterSync(cliId, cliPathOverride); } catch { return 'none'; }
  return ad.pluginDir ? 'dynamic' : ad.skillsDir ? 'global' : 'none';
}

// ─── Built-in skill catalog (prompt mode) ────────────────────────────────────

export interface BuiltinSkillEntry { name: string; description: string; content: string; }

/** Skills fully covered operationally by the always-present `<botmux_routing>`
 *  block. `botmux-send` intentionally stays discoverable: routing teaches the
 *  basic command, while its full skill owns complex delivery and safety rules. */
const FULLY_ROUTING_COVERED_SKILLS = new Set(['botmux-history', 'botmux-quoted', 'botmux-bots']);

/** Keep the prompt-mode discovery cost bounded. The native/global skill keeps
 *  its full frontmatter description; the one-line session catalog only needs a
 *  high-signal trigger for the send cases that routing does not fully cover. */
function promptCatalogDescription(entry: BuiltinSkillEntry, locale?: Locale): string {
  if (entry.name !== 'botmux-send') return entry.description;
  void locale;
  return 'Read before the first complex Lark send: structured or multiline Markdown, attachments, cards, mentions, cross-chat or top-level publishing, or --attention. Follow the heredoc and --content-file rules; never send JSON-escaped newlines as literal text.';
}

/** First `description:` value from a SKILL.md YAML frontmatter (single line). */
function frontmatterDescription(content: string): string {
  const fm = content.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  const line = fm.split('\n').find((l) => l.startsWith('description:'));
  return line ? line.slice('description:'.length).trim() : '';
}

/**
 * The built-in skills the model should be told about in `prompt` mode. Mirrors
 * exactly what `global` mode would install: the unconditional BUILTIN_SKILLS,
 * plus the ask fallback when the CLI has no hook takeover, plus the whiteboard
 * skill when the feature is on.
 */
export function builtinSkillEntries(opts: {
  asksViaHook?: boolean;
  whiteboardEnabled?: boolean;
  /** Drop comms skills fully covered by `<botmux_routing>` (history/quoted/bots).
   *  Send remains as an on-demand complex-delivery skill. Set for the prompt-mode
   *  catalog; leave off for `botmux skill list`, which surfaces everything. */
  excludeRoutingCovered?: boolean;
}): BuiltinSkillEntry[] {
  let defs = [...BUILTIN_SKILLS];
  if (!opts.asksViaHook) defs.push({ name: ASK_SKILL_NAME, content: ASK_SKILL });
  if (opts.whiteboardEnabled) defs.push({ name: WHITEBOARD_SKILL_NAME, content: WHITEBOARD_SKILL });
  if (opts.excludeRoutingCovered) defs = defs.filter((d) => !FULLY_ROUTING_COVERED_SKILLS.has(d.name));
  return defs.map((d) => ({ name: d.name, description: frontmatterDescription(d.content), content: d.content }));
}

/**
 * Full SKILL.md body for a built-in skill name, used by `botmux skill show`
 * on-demand reads in `prompt` mode. This is independent of the per-CLI toggles,
 * so a name that made it into the catalog always resolves.
 */
export function builtinSkillContent(name: string): string | undefined {
  const all = [...BUILTIN_SKILLS, ...ON_DEMAND_BUILTIN_SKILLS, { name: ASK_SKILL_NAME, content: ASK_SKILL }, { name: WHITEBOARD_SKILL_NAME, content: WHITEBOARD_SKILL }];
  return all.find((d) => d.name === name)?.content;
}

/**
 * The `<botmux_builtin_skills>` prompt block for `prompt` mode: a one-line-per-skill
 * catalog (name + trigger description) plus the instruction to read the full
 * body on demand. The block contains descriptions only. Full instructions
 * are pulled via `botmux skill show <name>`, mirroring native progressive
 * disclosure without the per-session token cost of inlining every SKILL.md.
 *
 * Contract: only the outer wrapper is structural. The intro and catalog lines
 * are prose (including dynamic skill descriptions), so escape them here.
 */
export function buildBuiltinSkillCatalogBlock(entries: BuiltinSkillEntry[], locale?: Locale): string {
  void locale;
  const normalizedEntries = entries.flatMap((entry) => {
    const name = entry.name.trim();
    const description = promptCatalogDescription(entry, locale).trim();
    if (!name || !description) return [];
    return [{ name, description }];
  });
  if (normalizedEntries.length === 0) return '';
  const intro = '<botmux_routing> covers basic communication. Match the current task to one of these supplementary skills, then run `botmux skill show <name>` before acting. Do not guess command syntax.';
  const lines = normalizedEntries.map(entry => escapeXmlText(`- ${entry.name}: ${entry.description}`));
  // Distinct tag from the user-registered skill catalog (`<botmux_skills
  // mode=...>`, injected only in the worker via prepareSessionSkillPrompt) so
  // the two never collide and can co-exist in one prompt.
  return ['<botmux_builtin_skills>', escapeXmlText(intro), ...lines, '</botmux_builtin_skills>'].join('\n');
}

/** `off` mode nudge: no catalog, just point the model at the CLI's own help.
 *  Returned as an XML block (same `<botmux_builtin_skills>` tag as the catalog)
 *  so it's consistently wrapped rather than a bare line in the prompt. Its
 *  inner help line follows the same text-only contract as the catalog body. */
export function builtinSkillHelpPointer(locale?: Locale): string {
  void locale;
  const inner = 'Additional botmux capabilities are shell subcommands. Run `botmux --help` to list them and `botmux <command> --help` for command syntax.';
  return `<botmux_builtin_skills>\n${escapeXmlText(inner)}\n</botmux_builtin_skills>`;
}

/**
 * Skill catalog / help block for `injectsSessionContext` CLIs that only have a
 * global `skillsDir` (genius / grok). Session-manager omits the per-message
 * skill envelope for these CLIs, so the catalog must ride on the system-prompt
 * append flag (`--append-system-prompt` / `--rules`). Claude-family uses
 * `--plugin-dir` instead and does not call this.
 *
 * Resolves per-bot / machine `skillInjection` mode:
 *   - `prompt`: compact catalog with on-demand `botmux skill show`
 *   - `off`: help pointer only
 *   - `global`: empty because files are already installed
 */
export function builtinSkillBlockForInjectsSessionContext(
  larkAppId: string | undefined,
  locale: Locale | undefined,
  opts: { asksViaHook?: boolean; whiteboardEnabled?: boolean } = {},
): string {
  const mode = resolveSkillInjectionModeForApp(larkAppId);
  if (mode === 'prompt') {
    return buildBuiltinSkillCatalogBlock(
      builtinSkillEntries({
        asksViaHook: opts.asksViaHook === true,
        whiteboardEnabled: opts.whiteboardEnabled === true,
        excludeRoutingCovered: true,
      }),
      locale,
    );
  }
  if (mode === 'off') return builtinSkillHelpPointer(locale);
  return '';
}
