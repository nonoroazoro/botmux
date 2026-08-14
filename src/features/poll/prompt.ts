import type { Locale } from '../../i18n/index.js';

export function renderPollPromptHint(message: string, locale?: Locale): string {
  const hasPoll = /(?:投票|票选|\bpolls?\b|\bvot(?:e|ing)\b)/iu.test(message);
  const hasAction = /(?:创建|发起|新建|做个|来个|发布|发送|重发|再发|重新发|帮我投|投给|投第|投一票|选择第|\bcreate\b|\bmake\b|\bstart\b|\bpost\b|\bsend\b|\bresend\b|\brepost\b|\bcast\b|\bchoose\b|\bvote\s+(?:for|on)\b)/iu.test(message);
  if (!hasPoll || !hasAction) return '';
  const guidance = locale === 'en'
    ? 'This is a poll task. Create with exactly one `botmux poll create --title "..." --option "..." --option "..."` command, or vote with `botmux poll vote <poll-id> <choice>`. Do not read other skills or docs, run help, inspect history or source, announce progress, retry, or repair runtime files. A successful create is the complete response: send no extra text and finish with `BOTMUX_NOTHING_TO_SEND`. On failure, report the exact error immediately and stop.'
    : '这是投票任务。创建时只执行一次 `botmux poll create --title "..." --option "..." --option "..."`；投票时只执行 `botmux poll vote <poll-id> <choice>`。不要读取其他 skill 或文档，不要运行 help，不要检查历史或源码，不要先发进度，不要重试或修改运行文件。创建成功后卡片就是完整回复，不再发送文字，final 仅输出 `BOTMUX_NOTHING_TO_SEND`；失败时立即报告原始错误并停止。';
  return `<botmux_poll>\n${guidance}\n</botmux_poll>`;
}
