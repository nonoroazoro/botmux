export interface CreatePollCliArgs {
  operation: 'create';
  title: string;
  description?: string;
  chatId?: string;
  options: string[];
}

export interface VotePollCliArgs {
  operation: 'vote';
  pollId: string;
  option: string;
}

export type PollCliArgs = CreatePollCliArgs | VotePollCliArgs;

export type PollCliParseResult =
  | { ok: true; value: PollCliArgs }
  | { ok: false; error: string };

const USAGE = 'Usage: botmux poll create --title <title> --option <option> --option <option> [--description <text>] [--chat-id <oc_...>] | botmux poll vote <poll-id> <option-number|option-id|exact-text>';

function takeValue(args: string[], index: number, flag: string): { value?: string; consumed: number } {
  const token = args[index] ?? '';
  if (token === flag) return { value: args[index + 1], consumed: 2 };
  return { value: token.slice(flag.length + 1), consumed: 1 };
}

export function parsePollCliArgs(args: string[]): PollCliParseResult {
  if (args[0] === 'vote') {
    if (args.length !== 3 || !args[1]?.trim() || !args[2]?.trim()) {
      return { ok: false, error: USAGE };
    }
    return {
      ok: true,
      value: { operation: 'vote', pollId: args[1].trim(), option: args[2].trim() },
    };
  }
  if (args[0] !== 'create') return { ok: false, error: USAGE };

  let title = '';
  let description: string | undefined;
  let chatId: string | undefined;
  const options: string[] = [];
  let index = 1;
  while (index < args.length) {
    const token = args[index] ?? '';
    const flag = ['--title', '--description', '--chat-id', '--option']
      .find(candidate => token === candidate || token.startsWith(`${candidate}=`));
    if (!flag) return { ok: false, error: `Unknown argument: ${token}\n${USAGE}` };
    const parsed = takeValue(args, index, flag);
    const value = parsed.value?.trim();
    if (!value || value.startsWith('--')) return { ok: false, error: `${flag} requires a value` };
    if (flag === '--title') {
      if (title) return { ok: false, error: '--title can only be used once' };
      title = value;
    } else if (flag === '--description') {
      if (description) return { ok: false, error: '--description can only be used once' };
      description = value;
    } else if (flag === '--chat-id') {
      if (chatId) return { ok: false, error: '--chat-id can only be used once' };
      chatId = value;
    } else {
      options.push(value);
    }
    index += parsed.consumed;
  }
  if (!title) return { ok: false, error: '--title is required' };
  if (options.length < 2) return { ok: false, error: 'At least two --option values are required' };
  return {
    ok: true,
    value: {
      operation: 'create',
      title,
      options,
      ...(description ? { description } : {}),
      ...(chatId ? { chatId } : {}),
    },
  };
}
