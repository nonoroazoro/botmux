import type { CardActionData } from '../../im/lark/card-handler.js';
import { stampBotmuxCallbackMarkers } from '../../im/lark/callback-button-marker.js';
import { buildPollCard, buildPollControlCard, pollLocale } from './card.js';
import { getPollCopy } from './copy.js';
import { castHumanPollVote, renderPublishedPoll } from './service.js';
import { closePoll, getPoll, type PollRecord } from './store.js';

function resolvedPollLocale(poll: PollRecord | undefined): 'zh' | 'en' {
  return poll ? pollLocale(poll) : 'en';
}

export function isPollCardAction(action: unknown): boolean {
  return action === 'poll_vote' || action === 'poll_close';
}

export async function handlePollCardAction(
  data: CardActionData,
  larkAppId: string,
): Promise<Record<string, unknown>> {
  const pollId = data.action?.value?.poll_id;
  const action = data.action?.value?.action;
  const optionId = data.action?.value?.option_id;
  const openId = data.operator?.open_id;
  const messageId = data.context?.open_message_id ?? data.open_message_id;
  const existingPoll = pollId ? getPoll(pollId) : undefined;
  const actionCopy = getPollCopy(resolvedPollLocale(existingPoll));
  if (!pollId || !openId) {
    return { toast: { type: 'error', content: actionCopy.invalidAction } };
  }
  if (action === 'poll_close') {
    if (!existingPoll || existingPoll.ownerLarkAppId !== larkAppId) {
      return { toast: { type: 'error', content: actionCopy.pollUnavailable } };
    }
    const result = closePoll(pollId, openId);
    if (!result.ok) {
      const content = result.error === 'not_creator' ? actionCopy.notCreator : actionCopy.pollUnavailable;
      return { toast: { type: 'error', content } };
    }
    let refreshed = true;
    try { await renderPublishedPoll(result.poll.id, larkAppId); } catch { refreshed = false; }
    const copy = getPollCopy(pollLocale(result.poll));
    if (!refreshed) {
      return { toast: { type: 'error', content: copy.pollEndedRefreshFailed } };
    }
    const card = JSON.parse(stampBotmuxCallbackMarkers(buildPollControlCard(result.poll)));
    return {
      toast: { type: 'success', content: copy.pollEnded },
      card: { type: 'raw', data: card },
    };
  }
  if (action !== 'poll_vote' || !optionId || !messageId) {
    return { toast: { type: 'error', content: actionCopy.invalidAction } };
  }
  const result = castHumanPollVote({
    pollId,
    optionId,
    ownerLarkAppId: larkAppId,
    messageId,
    openId,
  });
  if (!result.ok) {
    const copy = getPollCopy(resolvedPollLocale(getPoll(pollId)));
    const content = result.error === 'option_not_found'
      ? copy.optionUnavailable
      : result.error === 'already_voted'
        ? copy.alreadyVoted
        : result.error === 'poll_closed' ? copy.pollClosed : copy.pollUnavailable;
    return { toast: { type: 'error', content } };
  }
  const copy = getPollCopy(pollLocale(result.poll));
  const card = JSON.parse(stampBotmuxCallbackMarkers(buildPollCard(result.poll)));
  return {
    toast: { type: 'success', content: copy.voteRecorded },
    card: { type: 'raw', data: card },
  };
}
