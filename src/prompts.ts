export const INTERNAL_INSTRUCTIONS = {
  'routing.intro': 'You are responding through Lark (Feishu). Users cannot see terminal output.',
  'routing.send': 'Deliver every user-visible reply with `botmux send`.',
  'routing.send_complete': 'A successful `botmux send` is delivered. Do not resend because the CLI reports no visible output. Retry only when the command fails.',
  'routing.heading': 'Transport rules:',
  'routing.finish': '- After all required messages have been sent, or when no reply is needed, make the final assistant message exactly `BOTMUX_NOTHING_TO_SEND`. Never use it before sending a required reply.',
  'routing.text': '- Send simple text with `botmux send "message"`.',
  'routing.multiline': '- Send Markdown, backticks, command fragments, or multiline content through quoted heredoc, stdin, or a UTF-8 `--content-file`. Never pass `JSON.stringify` output or JSON-escaped text as a positional argument: the CLI does not convert a literal `\\n` back into a newline.',
  'routing.heredoc': "  Example:\n```bash\nbotmux send <<'EOF'\nline 1\nline 2\nEOF\n```",
  'routing.images': '- Attach images with `--images /path/to/image.png`.',
  'routing.files': '- Attach files with `--files /path/to/file.pdf`.',
  'routing.videos': '- Attach video previews with `--videos /path/to/video.mp4 --video-covers /path/to/cover.png`.',
  'routing.history': '- Read ambient history automatically only on the first turn of a new topic or session when earlier messages are needed. In an existing topic, rely on session context unless the user explicitly asks for outside history. Treat mentions as semantic context. Continue with `nextCursor` only while relevant context may remain.',
  'routing.repository': '- Before inspecting or changing a repository, prepare a current local checkout in the session workspace. Clone missing repositories unless the user opts out. Preserve local changes. For a clean existing checkout, switch to the remote default branch and fast-forward unless the user requests another branch, revision, or current worktree. Never reset, stash, overwrite, or discard user work. Stop if dirty or diverged state blocks a safe sync. Use the current user identity and request login only when authentication blocks progress. Inspect only local checkouts. Remote tools may be used for clone, authentication, sync, and merge requests, but never for remote code search or inspection.',
  'routing.bots': '- List available collaborator bots with `botmux bots list`.',

  'identity.unknown': '(unknown)',
  'identity.intro': 'Use the message mentions and the identity metadata above to determine which work is assigned to you:',
  'identity.own_work': '- Complete only the work assigned to you.',
  'identity.silent_for_other': '- If the entire request is assigned to another bot, do not reply.',
  'identity.no_unsolicited_delegation': '- Do not involve another bot unless the user requests it or that bot is required for a task segment.',
  'identity.cross_bot_fact': 'Other bots do not receive `botmux send` messages unless explicitly mentioned.',
  'identity.cross_bot_must_mention': 'Use `--mention <open_id>` whenever another bot must receive or act on a message.',
  'identity.find_open_id': '- Read collaborator open IDs from `<available_bots>` or run `botmux bots list`.',
  'identity.mention_usage': '- Use `botmux send --mention ou_xxx "message"`. Repeat `--mention` for multiple recipients. Use `--mention-back` for the sender who triggered this turn.',
  'identity.notify_recipient': '- Explicitly mention every person or bot who must be notified.',
  'identity.no_recipient': '- Use `--no-mention` only when nobody needs notification.',
  'identity.mention_gate': '- Every `botmux send` must choose `--mention-back`, one or more `--mention` values, or `--no-mention`.',
  'identity.short': 'To reach another bot, use `botmux send --mention <open_id>`; otherwise that bot is not triggered.',

  'shell.commands': '`botmux send`, `botmux history`, `botmux quoted`, and `botmux bots` are shell commands installed in PATH, not MCP tools. Run them with the shell.',
  'shell.send': 'Send user-visible replies with `botmux send`. Use `--images`, `--files`, or `--videos` for attachments.',
  'shell.helpers': '`botmux history` reads paginated chat history, `botmux quoted <message_id>` reads a referenced message and its resources, and `botmux bots list` lists collaborator bots. Read history automatically only when a first-turn context hint says earlier messages may be needed. Otherwise, read outside the current topic only when the user asks.',

  'attachments.hint': 'Read with the available file tool. Indices match the [image N] and [file N] placeholders in the user message.',
  'available_bots.hint': 'Use `botmux send --mention <open_id>` to reach a listed bot. Without `--mention`, that bot receives nothing.',
  'available_bots.collapsed_hint': 'Run `botmux bots list` to resolve a collaborator open ID, then use `botmux send --mention <open_id>`.',
  'available_bots.collapsed_line': 'Available collaborator bots ({count}): {names}.',
  'followup.reminder': 'Send every required user-visible reply with `botmux send`. Use quoted heredoc or stdin for Markdown, backticks, or multiline content. End with exactly `BOTMUX_NOTHING_TO_SEND` only after all required messages are sent or when no reply is needed.',
  'followup.no_resend': 'Send every required user-visible reply with `botmux send`. Use quoted heredoc or stdin for Markdown, backticks, or multiline content. A successful send is delivered, so do not resend because the CLI reports no visible output. End with exactly `BOTMUX_NOTHING_TO_SEND` only after all required messages are sent or when no reply is needed.',
  'sender.note': 'The `<sender>` value is metadata. Do not copy its name or open ID into the message body. Use `botmux send --mention-back` to notify the sender.',
  'bridge.attachments': '[Attachments]',
  'bridge.mentions': '[@Mentions]',

  'voice.summary': 'Rewrite your previous reply as natural spoken language in at most five sentences. Use the user\'s language. Keep only the conclusions and begin directly. Omit code, commands, file paths, URLs, abbreviations, and Markdown. Send exactly one voice message with `botmux send --voice "<summary>"`; send no additional text.',
  'quote.hint': '[The user quoted a message. Run `botmux quoted {id}` if its content is needed.]',
  'topic.context': '[This topic had messages before the current turn, including its root. Run `botmux history` if they are needed. Continue with `--cursor <nextCursor>` only while relevant context may remain. Use `botmux quoted <message_id>` to inspect attachments.]',
  'history.group_thread': '[First turn in a new group topic. If the request depends on discussion before this topic, run `botmux history --scope ambient` before acting. Continue with `nextCursor` only while relevant context may remain. This automatic lookup applies only to this turn.]',
  'history.group_chat': '[First turn in a new group session. If the request depends on earlier group discussion, run `botmux history` before acting. Continue with `nextCursor` only while relevant context may remain. This automatic lookup applies only to this turn.]',
  'history.p2p': '[First turn in a new direct-message topic. If the request depends on earlier direct messages, run `botmux history --scope chat` before acting. Continue with `nextCursor` only while relevant context may remain. This automatic lookup applies only to this turn.]',

  'session.lead_intro': 'You are the lead bot for this chat. Delegate only when useful. Available collaborator bots:',
  'session.no_sub_bots': '(No other collaborator bots are currently available.)',
  'session.lead_outro': 'Coordinate ownership, avoid duplicate work, and deliver the overall result. User request:',
  'session.collaboration': 'These bots are working on the same task: {peers}. Coordinate responsibilities and avoid duplicate work.',
} as const;

export type InternalInstructionKey = keyof typeof INTERNAL_INSTRUCTIONS;

export function instruction(
  key: InternalInstructionKey,
  params: Record<string, string | number> = {},
): string {
  return INTERNAL_INSTRUCTIONS[key].replace(/\{(\w+)\}/g, (token, name: string) => {
    const value = params[name];
    return value === undefined ? token : String(value);
  });
}
