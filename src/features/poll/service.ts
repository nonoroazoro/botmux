import { deleteMessage, sendMessage, sendUserMessage, updateMessage } from '../../im/lark/client.js';
import { buildPollCard, buildPollControlCard } from './card.js';
import {
  attachPollMessage,
  castPollVote,
  createPoll,
  deletePoll,
  getPoll,
  type CastPollVoteResult,
  type CreatePollInput,
  type PollRecord,
} from './store.js';

export interface HumanPollVoteInput {
  pollId: string;
  optionId: string;
  ownerLarkAppId: string;
  messageId: string;
  openId: string;
}

export interface BotPollVoteInput {
  pollId: string;
  option: string;
  larkAppId: string;
  displayName: string;
}

const _renderQueues = new Map<string, Promise<unknown>>();

function resolveOptionId(poll: PollRecord, value: string): string | undefined {
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (poll.options.some(option => option.id === normalized)) return normalized;
  const index = Number(normalized);
  if (Number.isSafeInteger(index) && index >= 1 && index <= poll.options.length) {
    return poll.options[index - 1]?.id;
  }
  return poll.options.find(option => option.text === normalized)?.id;
}

function enqueueRender<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = _renderQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  _renderQueues.set(key, next);
  return next.finally(() => {
    if (_renderQueues.get(key) === next) _renderQueues.delete(key);
  });
}

export async function createAndPublishPoll(
  input: CreatePollInput,
  creatorChatId?: string,
): Promise<PollRecord> {
  const poll = createPoll(input);
  let controlMessageId: string | undefined;
  let publicMessageId: string | undefined;
  try {
    const controlCard = buildPollControlCard(poll);
    controlMessageId = creatorChatId
      ? await sendMessage(poll.ownerLarkAppId, creatorChatId, controlCard, 'interactive')
      : await sendUserMessage(poll.ownerLarkAppId, input.creatorOpenId, controlCard, 'interactive');
    publicMessageId = await sendMessage(
      poll.ownerLarkAppId,
      poll.chatId,
      buildPollCard(poll),
      'interactive',
    );
    return attachPollMessage(poll.id, publicMessageId);
  } catch (error) {
    if (publicMessageId) {
      await deleteMessage(poll.ownerLarkAppId, publicMessageId).catch(() => undefined);
    }
    if (controlMessageId) {
      await deleteMessage(poll.ownerLarkAppId, controlMessageId).catch(() => undefined);
    }
    try { deletePoll(poll.id); } catch { /* preserve the delivery error */ }
    throw error;
  }
}

export function castHumanPollVote(input: HumanPollVoteInput): CastPollVoteResult {
  const poll = getPoll(input.pollId);
  if (!poll) return { ok: false, error: 'poll_not_found' };
  if (poll.ownerLarkAppId !== input.ownerLarkAppId || poll.messageId !== input.messageId) {
    return { ok: false, error: 'poll_not_found' };
  }
  return castPollVote({
    pollId: input.pollId,
    optionId: input.optionId,
    voterKey: `human:${input.openId}`,
    kind: 'human',
    openId: input.openId,
  });
}

export function castBotPollVote(input: BotPollVoteInput): CastPollVoteResult {
  const poll = getPoll(input.pollId);
  if (!poll) return { ok: false, error: 'poll_not_found' };
  const optionId = resolveOptionId(poll, input.option);
  if (!optionId) return { ok: false, error: 'option_not_found' };
  return castPollVote({
    pollId: input.pollId,
    optionId,
    voterKey: `bot:${input.larkAppId}`,
    kind: 'bot',
    displayName: input.displayName,
  });
}

export function renderPublishedPoll(pollId: string, ownerLarkAppId: string): Promise<PollRecord> {
  return enqueueRender(pollId, async () => {
    const poll = getPoll(pollId);
    if (!poll || poll.ownerLarkAppId !== ownerLarkAppId || !poll.messageId) {
      throw new Error('poll_not_found');
    }
    await updateMessage(ownerLarkAppId, poll.messageId, buildPollCard(poll));
    return poll;
  });
}
