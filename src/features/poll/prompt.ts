import type { Locale } from '../../i18n/index.js';

export function renderPollPromptHint(message: string, locale?: Locale): string {
  const hasPoll = /(?:投票|票选|\bpolls?\b|\bvot(?:e|ing)\b)/iu.test(message);
  const hasAction = /(?:创建|发起|新建|做个|来个|发布|发送|重发|再发|重新发|帮我投|投给|投第|投一票|选择第|\bcreate\b|\bmake\b|\bstart\b|\bpost\b|\bsend\b|\bresend\b|\brepost\b|\bcast\b|\bchoose\b|\bvote\s+(?:for|on)\b)/iu.test(message);
  if (!hasPoll || !hasAction) return '';
  void locale;
  const guidance = 'This is a poll task. Create with exactly one `botmux poll create --title "..." --option "..." --option "..."` command, or vote with `botmux poll vote <poll-id> <choice>`. Do not read unrelated skills or documentation, inspect source or history, announce progress, retry, or modify runtime files. A successful create is the complete response: send no additional text and end with `BOTMUX_NOTHING_TO_SEND`. On failure, report the exact error and stop.';
  return `<botmux_poll>\n${guidance}\n</botmux_poll>`;
}
