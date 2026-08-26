import {
  authenticateManagedTurnOrigin,
  type AuthenticatedTurnOrigin,
  type ManagedTurnOrigin,
} from './managed-turn-origin/index.js';

export type SessionScopedIpcAuthDecision =
  | { ok: true; origin?: Readonly<AuthenticatedTurnOrigin> }
  | { ok: false; error: 'origin_unproven' | 'managed_action_required' };

export interface SessionScopedIpcIdentity {
  sessionId: string;
  larkAppId: string;
  chatId: string;
  rootMessageId: string | null;
}

/** Replace every caller-selectable route field with the authenticated
 * daemon-session identity while preserving endpoint-specific payload fields. */
export function bindSessionScopedIpcIdentity<T extends object>(
  payload: T,
  identity: SessionScopedIpcIdentity,
): T & SessionScopedIpcIdentity {
  return { ...payload, ...identity };
}

/**
 * Narrow fallback for commands that legitimately originate inside a
 * read-isolated CLI and therefore cannot read the host IPC HMAC secret.
 *
 * The daemon resolves `liveOrigin` from its active session registry; callers must
 * present that session's current rotating capability. A successful decision
 * carries an immutable snapshot of the daemon-owned origin. Callers never
 * submit or choose the authenticated turn. Receiver sessions are denied unless
 * the endpoint is explicitly non-observable (currently SessionStart readiness).
 */
export function authorizeSessionScopedIpc(input: {
  trustedHost: boolean;
  receiverSession: boolean;
  allowReceiver: boolean;
  liveOrigin?: ManagedTurnOrigin;
  claimedCapability?: string;
}): SessionScopedIpcAuthDecision {
  if (input.trustedHost) {
    return {
      ok: true,
      ...(input.liveOrigin ? {
        origin: {
          ...(input.liveOrigin.turnId ? { turnId: input.liveOrigin.turnId } : {}),
          ...(input.liveOrigin.dispatchAttempt !== undefined
            ? { dispatchAttempt: input.liveOrigin.dispatchAttempt }
            : {}),
        },
      } : {}),
    };
  }
  if (input.receiverSession && !input.allowReceiver) {
    return { ok: false, error: 'managed_action_required' };
  }
  const origin = authenticateManagedTurnOrigin(input.liveOrigin, input.claimedCapability);
  return origin
    ? { ok: true, origin }
    : { ok: false, error: 'origin_unproven' };
}
