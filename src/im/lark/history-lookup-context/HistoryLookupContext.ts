import type { Locale } from '../../../i18n/index.js';
import { instruction, type InternalInstructionKey } from '../../../prompts.js';

/**
 * Build a lightweight first-turn hint with the correct history scope.
 *
 * @param chatType The Lark conversation type.
 * @param scope The botmux session scope.
 * @param locale The bot locale.
 * @returns A prompt hint without fetching message content.
 */
export function buildHistoryLookupContext(
  chatType: 'p2p' | 'group',
  scope: 'chat' | 'thread',
  locale?: Locale,
): string {
  void locale;
  const key: InternalInstructionKey = chatType === 'p2p'
    ? 'history.p2p'
    : scope === 'thread'
      ? 'history.group_thread'
      : 'history.group_chat';
  return `${instruction(key)}\n`;
}
