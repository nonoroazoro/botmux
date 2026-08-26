import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplyTargetEntry, Session } from '../../../src/types.js';

const lark = vi.hoisted(() => ({ addReaction: vi.fn() }));

vi.mock('../../../src/im/lark/client.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../../src/im/lark/client.js')>(),
  addReaction: lark.addReaction,
}));

import { reactToCurrentTurn } from '../../../src/core/personality/index.js';

function target(updatedAt: string): ReplyTargetEntry {
  return { updatedAt, senderOpenId: 'ou_user' };
}

describe('personality reaction service', () => {
  beforeEach(() => {
    lark.addReaction.mockReset();
  });

  it('binds the reaction to the exact current message and persists it once', async () => {
    lark.addReaction.mockResolvedValueOnce('reaction-1');
    const replyTargets = { om_current: target('2026-08-25T00:00:00.000Z') };
    const ledger: NonNullable<Session['personalityReactionLedger']> = {};
    const persist = vi.fn();
    const input = {
      larkAppId: 'cli_bot',
      sessionId: 'session-1',
      turnId: 'om_current',
      emoji: 'no' as const,
      enabled: true,
      replyTargets,
      ledger,
      persist,
      now: new Date('2026-08-25T01:00:00.000Z'),
    };

    await expect(reactToCurrentTurn(input)).resolves.toEqual({ ok: true, status: 'created', emoji: 'no' });
    expect(lark.addReaction).toHaveBeenCalledWith(
      'cli_bot',
      'om_current',
      'No',
      { timeoutMs: 5_000 },
    );
    expect(ledger.om_current).toEqual({
      emoji: 'no',
      reactionId: 'reaction-1',
      createdAt: '2026-08-25T01:00:00.000Z',
    });
    expect(persist).toHaveBeenCalledOnce();

    await expect(reactToCurrentTurn(input)).resolves.toEqual({ ok: true, status: 'already_created', emoji: 'no' });
    expect(lark.addReaction).toHaveBeenCalledOnce();
  });

  it('refuses arbitrary turns, a second emoji, disabled reactions, and bursts', async () => {
    const now = new Date('2026-08-25T01:00:00.000Z');
    const ledger = Object.fromEntries(Array.from({ length: 4 }, (_, index) => [
      `om_recent_${index}`,
      {
        emoji: 'like' as const,
        reactionId: `r${index}`,
        createdAt: now.toISOString(),
      },
    ])) satisfies NonNullable<Session['personalityReactionLedger']>;
    const base = {
      larkAppId: 'cli_bot',
      sessionId: 'session-1',
      emoji: 'heart' as const,
      enabled: true,
      persist: vi.fn(),
      now,
    };

    await expect(reactToCurrentTurn({ ...base, turnId: 'uuid', replyTargets: {}, ledger: {} }))
      .resolves.toEqual({ ok: false, status: 'invalid_turn' });
    await expect(reactToCurrentTurn({
      ...base,
      turnId: 'om_current',
      replyTargets: { om_current: target(now.toISOString()) },
      ledger: {
        om_current: { emoji: 'yes', reactionId: 'r', createdAt: now.toISOString() },
      },
    }))
      .resolves.toEqual({ ok: false, status: 'already_reacted' });
    await expect(reactToCurrentTurn({
      ...base,
      enabled: false,
      turnId: 'om_current',
      replyTargets: { om_current: target(now.toISOString()) },
      ledger: {},
    }))
      .resolves.toEqual({ ok: false, status: 'disabled' });
    await expect(reactToCurrentTurn({
      ...base,
      turnId: 'om_current',
      replyTargets: { om_current: target(now.toISOString()) },
      ledger,
    }))
      .resolves.toEqual({ ok: false, status: 'rate_limited' });
  });

  it('keeps idempotency and rate limits independent from the routing cache', async () => {
    const now = new Date('2026-08-25T01:00:00.000Z');
    const ledger: NonNullable<Session['personalityReactionLedger']> = {
      om_current: { emoji: 'no', reactionId: 'r0', createdAt: now.toISOString() },
    };
    const base = {
      larkAppId: 'cli_bot',
      sessionId: 'session-1',
      turnId: 'om_current',
      enabled: true,
      persist: vi.fn(),
      now,
    };

    await expect(reactToCurrentTurn({
      ...base,
      emoji: 'no',
      replyTargets: { om_current: target(now.toISOString()) },
      ledger,
    })).resolves.toEqual({ ok: true, status: 'already_created', emoji: 'no' });

    for (let index = 1; index < 4; index += 1) {
      ledger[`om_old_${index}`] = {
        emoji: 'like',
        reactionId: `r${index}`,
        createdAt: now.toISOString(),
      };
    }
    const replyTargets: Record<string, ReplyTargetEntry> = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [
      `om_route_${index}`,
      target(now.toISOString()),
    ]));
    replyTargets.om_next = target(now.toISOString());

    await expect(reactToCurrentTurn({
      ...base,
      turnId: 'om_next',
      emoji: 'heart',
      replyTargets,
      ledger,
    })).resolves.toEqual({ ok: false, status: 'rate_limited' });
    expect(lark.addReaction).not.toHaveBeenCalled();
  });

  it('commits provider success even if the routing cache changes in flight', async () => {
    const replyTargets = { om_current: target('2026-08-25T00:00:00.000Z') };
    lark.addReaction.mockImplementationOnce(async () => {
      delete replyTargets.om_current;
      return 'reaction-1';
    });
    const ledger: NonNullable<Session['personalityReactionLedger']> = {};
    const persist = vi.fn();

    await expect(reactToCurrentTurn({
      larkAppId: 'cli_bot',
      sessionId: 'session-1',
      turnId: 'om_current',
      emoji: 'heart',
      enabled: true,
      replyTargets,
      ledger,
      persist,
      now: new Date('2026-08-25T01:00:00.000Z'),
    })).resolves.toEqual({ ok: true, status: 'created', emoji: 'heart' });
    expect(ledger.om_current?.reactionId).toBe('reaction-1');
    expect(persist).toHaveBeenCalledOnce();
  });

  it('keeps provider success and in-memory idempotency when persistence fails', async () => {
    lark.addReaction.mockResolvedValueOnce('reaction-1');
    const ledger: NonNullable<Session['personalityReactionLedger']> = {};
    const persistenceError = new Error('disk unavailable');
    const onPersistenceError = vi.fn();

    await expect(reactToCurrentTurn({
      larkAppId: 'cli_bot',
      sessionId: 'session-1',
      turnId: 'om_current',
      emoji: 'like',
      enabled: true,
      replyTargets: { om_current: target('2026-08-25T00:00:00.000Z') },
      ledger,
      persist: () => { throw persistenceError; },
      onPersistenceError,
      now: new Date('2026-08-25T01:00:00.000Z'),
    })).resolves.toEqual({ ok: true, status: 'created', emoji: 'like' });
    expect(ledger.om_current?.reactionId).toBe('reaction-1');
    expect(onPersistenceError).toHaveBeenCalledWith(persistenceError);

    await expect(reactToCurrentTurn({
      larkAppId: 'cli_bot',
      sessionId: 'session-1',
      turnId: 'om_current',
      emoji: 'like',
      enabled: true,
      replyTargets: { om_current: target('2026-08-25T00:00:00.000Z') },
      ledger,
      persist: vi.fn(),
    })).resolves.toEqual({ ok: true, status: 'already_created', emoji: 'like' });
    expect(lark.addReaction).toHaveBeenCalledOnce();
  });
});
