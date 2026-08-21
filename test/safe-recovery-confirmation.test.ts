import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  _resetForTest,
  findPendingAskByAnchor,
  setCanTalkChecker,
  setCardDispatcher,
  submitCustomReply,
  tryResolveAsk,
} from '../src/core/ask-broker.js';
import { AskDispatchError, type PendingAsk } from '../src/core/ask-types.js';
import {
  requestSafeRecoveryConfirmation,
  sendWorkerSessionInput,
} from '../src/core/worker-pool.js';

afterEach(() => {
  _resetForTest();
});

function makeSession(send: ReturnType<typeof vi.fn>) {
  return {
    session: {
      sessionId: 'session-safe-recovery',
      status: 'active',
      cliId: 'codex',
      rootMessageId: 'om_root',
      currentReplyTarget: { rootMessageId: 'om_root', turnId: 'om_retry', updatedAt: '2026-08-20T00:00:00.000Z' },
      replyTargets: {
        om_retry: {
          rootMessageId: 'om_root',
          senderOpenId: 'ou_requester',
          updatedAt: '2026-08-20T00:00:00.000Z',
        },
      },
    },
    worker: { send, killed: false },
    larkAppId: 'cli_safe_recovery',
    chatId: 'oc_chat',
    chatType: 'group',
    scope: 'thread',
  } as any;
}

async function nextTick(): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, 0));
}

describe('safe recovery confirmation', () => {
  it('allows only the exact requesting user to authorize recovery', async () => {
    const send = vi.fn();
    const session = makeSession(send);
    let ask: PendingAsk | undefined;
    setCanTalkChecker(() => true);
    setCardDispatcher({
      send: async pending => {
        ask = pending;
        return { messageId: 'om_confirmation_card' };
      },
    });

    await expect(requestSafeRecoveryConfirmation(session, 'Original task context', 'om_retry')).resolves
      .toEqual({ ok: true, pending: false });
    expect(ask?.answererOpenId).toBe('ou_requester');
    expect(ask?.presentation).toEqual({ type: 'safe_recovery' });
    expect(ask?.allowCustomReply).toBe(false);
    expect(findPendingAskByAnchor({
      larkAppId: session.larkAppId,
      chatId: session.chatId,
      anchor: 'om_root',
      answererOpenId: 'ou_requester',
    })).toBeUndefined();
    expect(submitCustomReply({
      askId: ask?.askId ?? '',
      by: 'ou_requester',
      text: 'Continue',
    })).toBe('stale');

    expect(tryResolveAsk({
      askId: ask?.askId ?? '',
      nonce: ask?.nonce ?? '',
      selected: 'confirm',
      by: 'ou_other',
    })).toBe('unauthorized');
    expect(send).not.toHaveBeenCalled();

    expect(tryResolveAsk({
      askId: ask?.askId ?? '',
      nonce: ask?.nonce ?? '',
      selected: 'confirm',
      by: 'ou_requester',
    })).toBe('accepted');
    await nextTick();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'safe_recover',
      content: 'Original task context',
      turnId: 'om_retry',
      requestId: expect.any(String),
    }));
  });

  it('invalidates confirmation when a normal message supersedes recovery', async () => {
    const send = vi.fn();
    const session = makeSession(send);
    let ask: PendingAsk | undefined;
    const onSettle = vi.fn();
    setCanTalkChecker(() => true);
    setCardDispatcher({
      send: async pending => {
        ask = pending;
        return { messageId: 'om_confirmation_card' };
      },
      onSettle,
    });

    await requestSafeRecoveryConfirmation(session, 'Original task context', 'om_retry');
    const nextMessage = { type: 'message' as const, content: 'Handle a different task', turnId: 'om_next' };
    expect(sendWorkerSessionInput(session, nextMessage)).toBe(true);
    await nextTick();
    expect(onSettle).toHaveBeenCalledWith(
      expect.objectContaining({ askId: ask?.askId }),
      expect.objectContaining({ kind: 'invalidated' }),
    );
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(nextMessage);
  });

  it('waits for the preparing-card patch before starting recovery', async () => {
    const send = vi.fn();
    const session = makeSession(send);
    let ask: PendingAsk | undefined;
    let finishPatch: (() => void) | undefined;
    setCanTalkChecker(() => true);
    setCardDispatcher({
      send: async pending => {
        ask = pending;
        return { messageId: 'om_confirmation_card' };
      },
      onSettle: () => new Promise<void>((resolve) => {
        finishPatch = resolve;
      }),
    });

    await requestSafeRecoveryConfirmation(session, 'Original task context', 'om_retry');
    expect(tryResolveAsk({
      askId: ask?.askId ?? '',
      nonce: ask?.nonce ?? '',
      selected: 'confirm',
      by: 'ou_requester',
    })).toBe('accepted');
    await nextTick();
    expect(send).not.toHaveBeenCalled();

    finishPatch?.();
    await nextTick();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'safe_recover' }));
  });

  it('fails closed when the exact requester cannot be derived', async () => {
    setCanTalkChecker(() => true);
    setCardDispatcher({ send: async () => ({ messageId: 'om_unused' }) });
    const session = makeSession(vi.fn());
    delete session.session.replyTargets.om_retry.senderOpenId;

    await expect(requestSafeRecoveryConfirmation(session, 'Original task context', 'om_retry')).resolves
      .toEqual({ ok: false, error: 'requester_unavailable' });
  });

  it('does not report success before the confirmation card is dispatched', async () => {
    setCanTalkChecker(() => true);
    setCardDispatcher({
      send: async () => {
        throw new AskDispatchError('permission denied', false);
      },
    });
    const session = makeSession(vi.fn());

    await expect(requestSafeRecoveryConfirmation(
      session,
      'Original task context',
      'om_retry',
    )).resolves.toEqual({ ok: false, error: 'card_dispatch_failed' });
    expect(session.pendingSafeRecovery).toBeUndefined();
  });
});
