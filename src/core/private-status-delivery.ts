import { sendEphemeralCard, sendUserMessage } from '../im/lark/client.js';
import type { DaemonSession } from './types.js';

/**
 * Deliver an operational status only to the administrator who triggered it.
 * The caller must authorize the operator before invoking this helper.
 */
export async function deliverPrivateStatusToOperator(
  ds: DaemonSession,
  operatorOpenId: string | undefined,
  content: string,
): Promise<'ephemeral' | 'dm' | 'failed'> {
  if (!operatorOpenId) return 'failed';
  const cardJson = JSON.stringify({
    config: { wide_screen_mode: true },
    elements: [{ tag: 'markdown', content }],
  });
  const replyTarget = ds.currentReplyTarget ?? ds.session.currentReplyTarget;
  const isThreaded = ds.scope === 'thread'
    || (!!replyTarget?.rootMessageId && replyTarget.quoteOnly !== true);
  if (ds.chatType !== 'p2p' && !isThreaded) {
    try {
      await sendEphemeralCard(ds.larkAppId, ds.chatId, operatorOpenId, cardJson);
      return 'ephemeral';
    } catch {
      // Fall through to a private DM.
    }
  }
  try {
    await sendUserMessage(ds.larkAppId, operatorOpenId, cardJson, 'interactive');
    return 'dm';
  } catch {
    return 'failed';
  }
}
