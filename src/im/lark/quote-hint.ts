/**
 * Build the quote hint prepended when the user references an earlier message
 * through Lark's quote-reply UI.
 *
 * Returns an empty string when no quote is present, or when `parent_id`
 * collapses to the thread root / current message id (those are routing
 * plumbing, not a user-visible quote action. Surfacing them would make
 * the bot run `botmux quoted` on its own thread root every turn).
 *
 * Shared by handleNewTopic and handleThreadReply so first-turn quote-replies
 * (no active session yet) surface the same hint as follow-ups
 * in an existing session (handleThreadReply).
 */
import type { Locale } from '../../i18n/index.js';
import { instruction } from '../../prompts.js';

export function buildQuoteHint(
  parsed: { parentId?: string; messageId: string },
  scope: 'thread' | 'chat',
  anchor: string,
  locale?: Locale,
): string {
  const quotedId = parsed.parentId;
  if (!quotedId) return '';
  const threadRoot = scope === 'thread' ? anchor : null;
  if (quotedId === threadRoot || quotedId === parsed.messageId) return '';
  void locale;
  return `${instruction('quote.hint', { id: quotedId })}\n`;
}
