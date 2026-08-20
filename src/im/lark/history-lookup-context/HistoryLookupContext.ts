import { t, type Locale } from '../../../i18n/index.js';

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
  const key = chatType === 'p2p'
    ? 'prompt.history_lookup.p2p'
    : scope === 'thread'
      ? 'prompt.history_lookup.group_thread'
      : 'prompt.history_lookup.group_chat';
  return `${t(key, undefined, locale)}\n`;
}
