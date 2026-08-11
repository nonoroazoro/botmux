import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DaemonSession } from '../../src/core/types.js';

const { sendEphemeralCard, sendUserMessage } = vi.hoisted(() => ({
  sendEphemeralCard: vi.fn(),
  sendUserMessage: vi.fn(),
}));

vi.mock('../../src/im/lark/client.js', () => ({
  sendEphemeralCard,
  sendUserMessage,
}));

import { deliverPrivateStatusToOperator } from '../../src/core/private-status-delivery.js';

function session(overrides: Partial<DaemonSession> = {}): DaemonSession {
  const base: DaemonSession = {
    session: {
      sessionId: 'session_test',
      chatId: 'oc_test',
      rootMessageId: 'om_test',
      title: 'Test session',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    worker: null,
    workerPort: null,
    workerToken: null,
    larkAppId: 'app_test',
    chatId: 'oc_test',
    chatType: 'group',
    scope: 'chat',
    spawnedAt: 0,
    cliVersion: 'test',
    lastMessageAt: 0,
    hasHistory: true,
  };
  return { ...base, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  sendEphemeralCard.mockResolvedValue('om_ephemeral');
  sendUserMessage.mockResolvedValue('om_dm');
});

describe('deliverPrivateStatusToOperator', () => {
  it('uses an operator-only ephemeral card in a flat group', async () => {
    const result = await deliverPrivateStatusToOperator(session(), 'ou_admin', 'Restarting');

    expect(result).toBe('ephemeral');
    expect(sendEphemeralCard).toHaveBeenCalledWith(
      'app_test',
      'oc_test',
      'ou_admin',
      expect.stringContaining('Restarting'),
    );
    expect(sendUserMessage).not.toHaveBeenCalled();
  });

  it('uses a private DM for a thread-scoped session', async () => {
    const result = await deliverPrivateStatusToOperator(
      session({ scope: 'thread' }),
      'ou_admin',
      'Restarting',
    );

    expect(result).toBe('dm');
    expect(sendEphemeralCard).not.toHaveBeenCalled();
    expect(sendUserMessage).toHaveBeenCalledWith(
      'app_test',
      'ou_admin',
      expect.stringContaining('Restarting'),
      'interactive',
    );
  });

  it('falls back from ephemeral to a private DM without a visible reply', async () => {
    sendEphemeralCard.mockRejectedValueOnce(new Error('unsupported'));

    const result = await deliverPrivateStatusToOperator(session(), 'ou_admin', 'Restarting');

    expect(result).toBe('dm');
    expect(sendUserMessage).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the operator identity is unavailable', async () => {
    const result = await deliverPrivateStatusToOperator(session(), undefined, 'Restarting');

    expect(result).toBe('failed');
    expect(sendEphemeralCard).not.toHaveBeenCalled();
    expect(sendUserMessage).not.toHaveBeenCalled();
  });

  it('fails closed when both private delivery channels fail', async () => {
    sendEphemeralCard.mockRejectedValueOnce(new Error('ephemeral unavailable'));
    sendUserMessage.mockRejectedValueOnce(new Error('DM unavailable'));

    const result = await deliverPrivateStatusToOperator(session(), 'ou_admin', 'Restarting');

    expect(result).toBe('failed');
    expect(sendEphemeralCard).toHaveBeenCalledTimes(1);
    expect(sendUserMessage).toHaveBeenCalledTimes(1);
  });
});
