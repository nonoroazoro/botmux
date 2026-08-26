import { describe, expect, it } from 'vitest';
import { authorizeSessionScopedIpc } from '../../src/core/daemon-ipc-session-auth.js';

describe('session-scoped IPC authority', () => {
  it('authenticates a capability into a daemon-owned origin snapshot', () => {
    const liveOrigin = {
      capability: 'ab'.repeat(32),
      turnId: 'om_current',
      dispatchAttempt: 3,
    };
    const decision = authorizeSessionScopedIpc({
      trustedHost: false,
      receiverSession: false,
      allowReceiver: false,
      liveOrigin,
      claimedCapability: liveOrigin.capability,
    });

    expect(decision).toEqual({
      ok: true,
      origin: { turnId: 'om_current', dispatchAttempt: 3 },
    });
    liveOrigin.turnId = 'om_next';
    expect(decision).toMatchObject({ ok: true, origin: { turnId: 'om_current' } });
  });

  it('rejects a stale capability and never accepts caller routing as authority', () => {
    expect(authorizeSessionScopedIpc({
      trustedHost: false,
      receiverSession: false,
      allowReceiver: false,
      liveOrigin: { capability: 'ab'.repeat(32), turnId: 'om_current' },
      claimedCapability: 'cd'.repeat(32),
    })).toEqual({ ok: false, error: 'origin_unproven' });
  });
});
