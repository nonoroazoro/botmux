import { parsePollCliArgs } from './poll-args.js';
import { requestSessionPoll } from './session-poll-client.js';

export async function cmdPoll(args: string[]): Promise<void> {
  const parsed = parsePollCliArgs(args);
  if (!parsed.ok) {
    console.error(parsed.error);
    process.exitCode = 2;
    return;
  }
  try {
    const body = parsed.value.operation === 'create'
      ? {
          title: parsed.value.title,
          options: parsed.value.options,
          ...(parsed.value.description ? { description: parsed.value.description } : {}),
          ...(parsed.value.chatId ? { chatId: parsed.value.chatId } : {}),
        }
      : { pollId: parsed.value.pollId, option: parsed.value.option };
    const payload = await requestSessionPoll({ operation: parsed.value.operation, body });
    const output = { ...payload };
    delete output.ok;
    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    console.error(`Poll failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
