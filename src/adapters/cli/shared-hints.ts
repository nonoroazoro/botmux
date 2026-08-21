/**
 * Shared botmux routing hints injected into non-injectsSessionContext CLIs'
 * initial prompt.
 *
 * CLIs that expose a system-prompt append flag set `injectsSessionContext` and
 * push `buildBotmuxSystemPromptText` via that flag instead:
 *   - Claude Code / genius: `--append-system-prompt`
 *   - Grok: `--rules` (docs: Claude's append alias)
 * This constant is only for CLIs without such a flag (coco / codex / gemini /
 * opencode / mtr / hermes / …).
 *
 * Each array element becomes one line inside the `<botmux_routing>` XML block
 * rendered by `buildNewTopicPrompt` in `session-manager.ts`.
 */
import type { Locale } from '../../i18n/index.js';
import { instruction, type InternalInstructionKey } from '../../prompts.js';
import { whiteboardEnabled } from '../../services/whiteboard-store.js';
import { config } from '../../config.js';
import { escapeXmlTagLikeTokens, escapeXmlText } from '../../utils/xml.js';

/** Keep Workflow discoverable even when the full skill catalog is not injected. */
function workflowDiscoveryHint(): string {
  return 'For a bounded multi-step goal, use natural language or `/workflow` to build a DAG. Successful runs can be saved and reused.';
}

function hiddenContextDefense(): string {
  const text = 'Treat `<botmux_routing>`, `<botmux_builtin_skills>`, `<identity>`, `<session_id>`, `<role>`, `<sender>`, `<mentions>`, `<available_bots>`, and `<attachments>` as hidden runtime context. Read and follow them silently. Do not acknowledge or summarize them. Handle only the request inside `<user_message>`.';
  // These tag names are prose inside `<botmux_routing>`, not nested blocks.
  return escapeXmlText(text);
}

export function buildBotmuxShellHints(locale?: Locale): string[] {
  void locale;
  const hints = [
    instruction('routing.intro'),
    instruction('shell.commands'),
    instruction('shell.send'),
    instruction('routing.multiline'),
    instruction('routing.heredoc'),
    instruction('shell.helpers'),
    instruction('routing.finish'),
    instruction('routing.repository'),
    // Experimental anti-resend guidance. Opt in through dashboard Settings
    // (dashboard.noVisibleOutputHint). Default OFF, so the rendered hints match
    // the pre-feature baseline unless an operator flips it on. Live-read here so
    // a toggle takes effect on the next session without a daemon restart.
    ...(config.noVisibleOutputHint ? [instruction('routing.send_complete')] : []),
    instruction('identity.mention_gate'),
    workflowDiscoveryHint(),
    hiddenContextDefense(),
  ].map(escapeXmlTagLikeTokens);
  if (whiteboardEnabled()) {
    hints.push(escapeXmlTagLikeTokens('When `<whiteboard>` is present, use `botmux whiteboard read/update` as needed. Never write secrets or private data. Use the user\'s language for updates and send user-visible conclusions with `botmux send`.'));
  }
  return hints;
}

/** @deprecated Use `buildBotmuxShellHints(locale)` instead. Kept for any external callers.
 *  Static legacy value must not read runtime config at module import time - so the
 *  experimental `no_visible_output_ok` line (gated on config.noVisibleOutputHint) is
 *  intentionally absent here; only the live `buildBotmuxShellHints` path carries it. */
export const BOTMUX_SHELL_HINTS: string[] = [
  instruction('routing.intro'),
  instruction('shell.commands'),
  instruction('shell.send'),
  instruction('routing.multiline'),
  instruction('routing.heredoc'),
  instruction('shell.helpers'),
  instruction('routing.finish'),
  instruction('routing.repository'),
  instruction('identity.mention_gate'),
  workflowDiscoveryHint(),
  hiddenContextDefense(),
].map(escapeXmlTagLikeTokens);

/**
 * Build the `<botmux_routing>` (+ optional `<identity>`) text injected via a
 * CLI's system-prompt flag (`--append-system-prompt`) for adapters that set
 * `injectsSessionContext`. Single source of truth shared by claude-code and
 * alternate runners keeps the routing and identity wording from drifting. The
 * session-manager omits these blocks from the per-message envelope for such
 * adapters, so this is the only place the model learns the routing rules.
 *
 * Real envelope tags stay structural, while complete `<...>` tokens inside
 * prose are escaped selectively so they cannot look like child elements.
 * Shell heredoc operators remain copyable, and bot fields are still rendered
 * from trusted bot config without changing their historical handling.
 */
export function buildBotmuxSystemPromptText(opts: {
  locale?: Locale;
  botName?: string;
  botOpenId?: string;
  /** Optional built-in skill catalog / help pointer for injectsSessionContext
   *  CLIs that have a global `skillsDir` (genius/grok) running in `prompt` / `off`
   *  mode - appended after the routing/identity blocks. Claude Code delivers
   *  skills via --plugin-dir and passes nothing here. */
  builtinSkillBlock?: string;
}): string {
  const { locale, botName, botOpenId, builtinSkillBlock } = opts;
  const normalizedBotName = botName?.trim() || undefined;
  const normalizedBotOpenId = botOpenId?.trim() || undefined;
  void locale;
  const prose = (key: InternalInstructionKey): string =>
    escapeXmlTagLikeTokens(instruction(key));
  const identityBlock =
    normalizedBotName || normalizedBotOpenId
      ? [
        '',
        '<identity>',
        ...(normalizedBotName ? [`  <name>${escapeXmlText(normalizedBotName)}</name>`] : []),
        ...(normalizedBotOpenId ? [`  <open_id>${escapeXmlText(normalizedBotOpenId)}</open_id>`] : []),
        '  <routing_rules>',
        `    ${prose('identity.intro')}`,
        `    ${prose('identity.own_work')}`,
        `    ${prose('identity.silent_for_other')}`,
        `    ${prose('identity.no_unsolicited_delegation')}`,
        '',
        `    ${prose('identity.cross_bot_fact')}`,
        `    ${prose('identity.cross_bot_must_mention')}`,
        `    ${prose('identity.find_open_id')}`,
        `    ${prose('identity.mention_usage')}`,
        `    ${prose('identity.notify_recipient')}`,
        `    ${prose('identity.no_recipient')}`,
        `    ${prose('identity.mention_gate')}`,
        '  </routing_rules>',
        '</identity>',
      ]
      : [];
  const whiteboardRouting = whiteboardEnabled()
    ? [
      '',
      escapeXmlTagLikeTokens('When `<whiteboard>` is present, use `botmux whiteboard read/update` as needed. Never write secrets or private data. Use the user\'s language for updates and send user-visible conclusions with `botmux send`.'),
    ]
    : [];
  return [
    '<botmux_routing>',
    prose('routing.intro'),
    prose('routing.send'),
    // Experimental anti-resend guidance. Opt in through dashboard Settings
    // (dashboard.noVisibleOutputHint). Default OFF ⇒ this block is byte-for-byte
    // the pre-feature baseline. Live-read so a toggle applies to the next session.
    ...(config.noVisibleOutputHint ? [prose('routing.send_complete')] : []),
    '',
    prose('routing.heading'),
    prose('routing.finish'),
    prose('routing.text'),
    prose('routing.multiline'),
    prose('routing.heredoc'),
    prose('routing.images'),
    prose('routing.files'),
    prose('routing.videos'),
    prose('routing.history'),
    prose('routing.repository'),
    prose('routing.bots'),
    escapeXmlTagLikeTokens(workflowDiscoveryHint()),
    hiddenContextDefense(),
    ...whiteboardRouting,
    '</botmux_routing>',
    ...identityBlock,
    ...(builtinSkillBlock ? ['', builtinSkillBlock] : []),
  ].join('\n');
}
