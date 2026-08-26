import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  readManagedOriginCapability: vi.fn(),
  resolveDaemonIpcPort: vi.fn(),
  loadDaemonIpcSecret: vi.fn(),
}));

vi.mock('../../src/core/managed-origin-capability.js', () => ({
  readManagedOriginCapability: dependencies.readManagedOriginCapability,
}));

vi.mock('../../src/utils/daemon-discovery.js', () => ({
  resolveDaemonIpcPort: dependencies.resolveDaemonIpcPort,
}));

vi.mock('../../src/core/daemon-ipc-auth.js', () => ({
  fetchDaemonIpc: vi.fn(),
  loadDaemonIpcSecret: dependencies.loadDaemonIpcSecret,
}));

import { requestSessionLarkProxy } from '../../src/cli/session-lark-proxy.js';

describe('session Lark proxy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    dependencies.readManagedOriginCapability.mockReset();
    dependencies.resolveDaemonIpcPort.mockReset().mockReturnValue(3001);
    dependencies.loadDaemonIpcSecret.mockReset().mockImplementation(() => {
      throw new Error('not available');
    });
  });

  it('submits only the capability and leaves turn binding to the daemon', async () => {
    dependencies.readManagedOriginCapability.mockReturnValue({
      sessionId: 'session-1',
      capability: 'cd'.repeat(32),
      turnId: 'om_current',
      dispatchAttempt: 3,
    });
    let sentBody: Record<string, unknown> | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ ok: true, status: 'created', emoji: 'no' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }));

    await expect(requestSessionLarkProxy({
      operation: 'react',
      sessionId: 'session-1',
      body: { emoji: 'no' },
      env: {},
    })).resolves.toMatchObject({ ok: true });
    expect(sentBody).toEqual({
      emoji: 'no',
      originCapability: 'cd'.repeat(32),
    });
  });

  it('supports the token-only payload published by the Linux relay', async () => {
    dependencies.readManagedOriginCapability.mockReturnValue({
      sessionId: 'session-1',
      capability: 'ef'.repeat(32),
    });
    let sentBody: Record<string, unknown> | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ ok: true, status: 'created', emoji: 'no' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }));

    await expect(requestSessionLarkProxy({
      operation: 'react',
      body: { emoji: 'no' },
      env: {
        BOTMUX_SESSION_ID: 'session-1',
        BOTMUX_SEND_RELAY: '/sandbox/outbox',
        BOTMUX_DAEMON_IPC_PORT: '3001',
      },
    })).resolves.toMatchObject({ ok: true });
    expect(dependencies.readManagedOriginCapability).toHaveBeenCalledWith(
      expect.any(String),
      'session-1',
      '/sandbox/outbox',
    );
    expect(sentBody).toEqual({
      emoji: 'no',
      originCapability: 'ef'.repeat(32),
    });
  });
});
