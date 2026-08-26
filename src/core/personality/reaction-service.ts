import { addReaction } from '../../im/lark/client.js';
import type { ReplyTargetEntry, Session } from '../../types.js';
import {
  PERSONALITY_REACTION_EMOJIS,
  type PersonalityReaction,
} from './reaction-types.js';

export type PersonalityReactionResult =
  | { ok: true; status: 'created' | 'already_created'; emoji: PersonalityReaction }
  | { ok: false; status: 'disabled' | 'invalid_turn' | 'already_reacted' | 'rate_limited' | 'in_progress' };

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 4;
const LEDGER_MAX = 256;
const REQUEST_TIMEOUT_MS = 5_000;
const pendingSessions = new Set<string>();

type PersonalityReactionLedger = NonNullable<Session['personalityReactionLedger']>;

function pruneLedger(ledger: PersonalityReactionLedger): void {
  const turns = Object.keys(ledger);
  if (turns.length <= LEDGER_MAX) return;
  const evicted = turns
    .sort((left, right) => ledger[left].createdAt.localeCompare(ledger[right].createdAt))
    .slice(0, turns.length - LEDGER_MAX);
  for (const turnId of evicted) delete ledger[turnId];
}

export async function reactToCurrentTurn(
  input: {
    larkAppId: string;
    sessionId: string;
    turnId: string;
    emoji: PersonalityReaction;
    enabled: boolean;
    replyTargets: Record<string, ReplyTargetEntry> | undefined;
    ledger: PersonalityReactionLedger;
    persist(): void;
    onPersistenceError?(error: unknown): void;
    now?: Date;
  },
): Promise<PersonalityReactionResult> {
  if (!/^om_[A-Za-z0-9_-]{1,252}$/u.test(input.turnId)) {
    return { ok: false, status: 'invalid_turn' };
  }
  if (!input.enabled) return { ok: false, status: 'disabled' };

  const target = input.replyTargets?.[input.turnId];
  if (!target) return { ok: false, status: 'invalid_turn' };
  const existing = input.ledger[input.turnId];
  if (existing) {
    return existing.emoji === input.emoji
      ? { ok: true, status: 'already_created', emoji: input.emoji }
      : { ok: false, status: 'already_reacted' };
  }

  if (pendingSessions.has(input.sessionId)) return { ok: false, status: 'in_progress' };
  pendingSessions.add(input.sessionId);

  try {
    const now = input.now ?? new Date();
    const cutoff = now.getTime() - RATE_WINDOW_MS;
    const recentCount = Object.values(input.ledger).filter(entry =>
      Date.parse(entry.createdAt) >= cutoff,
    ).length;
    if (recentCount >= RATE_LIMIT) return { ok: false, status: 'rate_limited' };

    const reactionId = await addReaction(
      input.larkAppId,
      input.turnId,
      PERSONALITY_REACTION_EMOJIS[input.emoji],
      { timeoutMs: REQUEST_TIMEOUT_MS },
    );
    input.ledger[input.turnId] = {
      emoji: input.emoji,
      reactionId,
      createdAt: now.toISOString(),
    };
    pruneLedger(input.ledger);
    try {
      input.persist();
    } catch (error) {
      try {
        input.onPersistenceError?.(error);
      } catch {
        // The provider mutation already succeeded. Reporting must not turn it
        // into a failed response or discard the in-memory idempotency record.
      }
    }
    return { ok: true, status: 'created', emoji: input.emoji };
  } finally {
    pendingSessions.delete(input.sessionId);
  }
}
