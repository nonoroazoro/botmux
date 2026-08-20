import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  process.env.SESSION_DATA_DIR =
    `${process.env.TMPDIR ?? '/tmp'}/botmux-transfer-passthrough-${process.pid}`;
  delete process.env.BOTMUX_SESSION_ID;
  delete process.env.BOTMUX_LARK_APP_ID;
  return {
    replyMessage: vi.fn(async () => 'om_reply'),
    sendMessage: vi.fn(async () => 'om_send'),
    updateSession: vi.fn(),
    forkWorker: vi.fn(),
  };
});

vi.mock('../src/im/lark/client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/im/lark/client.js')>();
  return {
    ...actual,
    replyMessage: (...args: any[]) => mocks.replyMessage(...args),
    sendMessage: (...args: any[]) => mocks.sendMessage(...args),
  };
});

vi.mock('../src/services/session-store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/session-store.js')>();
  return {
    ...actual,
    updateSession: (...args: any[]) => mocks.updateSession(...args),
  };
});

vi.mock('../src/bot-registry.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/bot-registry.js')>();
  return {
    ...actual,
    getBot: vi.fn(() => ({
      config: {
        larkAppId: 'app-transfer-passthrough',
        cliId: 'claude-code',
      },
      botName: 'TestBot',
      botOpenId: 'ou_bot',
      resolvedAllowedUsers: [],
    })),
  };
});

vi.mock('../src/core/worker-pool.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/core/worker-pool.js')>();
  return {
    ...actual,
    forkWorker: (...args: any[]) => mocks.forkWorker(...args),
  };
});

import {
  __testOnly_activeSessions as daemonActiveSessions,
  __testOnly_deliverPassthroughToExistingSession as deliverPassthrough,
} from '../src/daemon.js';
import {
  isSessionTransferring,
  setActiveSessionsRegistry,
  transferSession,
} from '../src/core/worker-pool.js';
import { sessionKey } from '../src/core/types.js';
import type { DaemonSession } from '../src/core/types.js';

beforeEach(() => {
  vi.clearAllMocks();
  daemonActiveSessions.clear();
});

describe('mid-transfer literal passthrough', () => {
  it('buffers raw input while worker=null and replays it on the target replacement', async () => {
    const ds = {
      session: {
        sessionId: 'session-transfer-passthrough',
        chatId: 'oc_source',
        rootMessageId: 'om_source',
        title: 'passthrough transfer',
        status: 'active',
        createdAt: new Date().toISOString(),
        scope: 'thread',
        chatType: 'group',
        larkAppId: 'app-transfer-passthrough',
        ownerOpenId: 'ou_owner',
        workingDir: '/tmp',
        cliId: 'claude-code',
      },
      worker: null,
      workerPort: null,
      workerToken: null,
      larkAppId: 'app-transfer-passthrough',
      chatId: 'oc_source',
      chatType: 'group',
      scope: 'thread',
      spawnedAt: Date.now(),
      cliVersion: '1.0.0',
      lastMessageAt: Date.now(),
      hasHistory: true,
      workingDir: '/tmp',
      lastScreenStatus: 'idle',
    } as DaemonSession;
    const registry = new Map<string, DaemonSession>([
      [sessionKey('om_source', ds.larkAppId), ds],
    ]);
    setActiveSessionsRegistry(registry);

    let releaseDetach!: (completed: boolean) => void;
    const detach = vi.fn(() => new Promise<boolean>((resolve) => {
      releaseDetach = resolve;
    }));
    const replacementSend = vi.fn();
    const replacement = Object.assign(new EventEmitter(), {
      killed: false,
      connected: true,
      exitCode: null,
      signalCode: null,
      send: replacementSend,
      kill: vi.fn(),
    }) as any;
    const replacementFork = vi.fn(() => {
      ds.worker = replacement;
    });

    const moving = transferSession(
      ds.session.sessionId,
      'oc_target',
      'om_target',
      'group',
      'chat',
      {
        detachWorkerImpl: detach,
        forkWorkerImpl: replacementFork as any,
      },
    );
    await vi.waitFor(() => expect(detach).toHaveBeenCalledOnce());
    expect(isSessionTransferring(ds)).toBe(true);
    expect(ds.worker).toBeNull();

    deliverPassthrough(
      ds,
      '/model',
      '/model opus',
      'om_source',
      ds.larkAppId,
      {
        messageId: 'om_passthrough_turn',
        senderOpenId: 'ou_owner',
        senderIsBot: false,
        substitute: false,
      },
    );

    expect(mocks.replyMessage).not.toHaveBeenCalled();
    expect(replacementSend).not.toHaveBeenCalled();

    releaseDetach(true);
    await expect(moving).resolves.toEqual({ ok: true });

    expect(replacementFork).toHaveBeenCalledWith(ds, '', true);
    expect(replacementSend).toHaveBeenCalledWith({
      type: 'raw_input',
      content: '/model opus',
      turnId: 'om_passthrough_turn',
    });
  });
});

describe('native new command', () => {
  it('wakes a suspended session, resets context, and queues /new for the replacement CLI', async () => {
    const ds = {
      session: {
        sessionId: 'session-dormant-new',
        chatId: 'oc_private',
        rootMessageId: 'om_private',
        title: 'private chat',
        status: 'active',
        createdAt: new Date().toISOString(),
        scope: 'chat',
        chatType: 'p2p',
        larkAppId: 'app-transfer-passthrough',
        ownerOpenId: 'ou_owner',
        workingDir: '/tmp',
        cliId: 'claude-code',
        cliSessionId: 'old-cli-session',
        lastUserPrompt: 'old prompt',
        lastCliInput: 'old input',
        lastCodexAppInput: { text: 'old app input' },
        pendingForkSession: true,
      },
      worker: null,
      workerPort: null,
      workerToken: null,
      larkAppId: 'app-transfer-passthrough',
      chatId: 'oc_private',
      chatType: 'p2p',
      scope: 'chat',
      spawnedAt: Date.now(),
      cliVersion: '1.0.0',
      lastMessageAt: Date.now(),
      hasHistory: true,
      pendingRepo: false,
      workingDir: '/tmp',
      lastScreenStatus: 'idle',
      lastUserPrompt: 'old prompt',
      lastCliInput: 'old input',
      lastCodexAppInput: { text: 'old app input' },
    } as DaemonSession;
    daemonActiveSessions.set(sessionKey('oc_private', ds.larkAppId), ds);

    deliverPassthrough(
      ds,
      '/new',
      '/new',
      'oc_private',
      ds.larkAppId,
      {
        messageId: 'om_new_turn',
        senderOpenId: 'ou_owner',
        senderIsBot: false,
        substitute: false,
      },
    );

    expect(ds.pendingRawInput).toBe('/new');
    expect(ds.pendingRawTurnId).toBe('om_new_turn');
    expect(mocks.forkWorker).toHaveBeenCalledWith(ds, '', { resume: true });
    expect(ds.hasHistory).toBe(false);
    expect(ds.lastUserPrompt).toBeUndefined();
    expect(ds.lastCliInput).toBeUndefined();
    expect(ds.lastCodexAppInput).toBeUndefined();
    expect(ds.session.lastUserPrompt).toBeUndefined();
    expect(ds.session.lastCliInput).toBeUndefined();
    expect(ds.session.lastCodexAppInput).toBeUndefined();
    expect(ds.session.cliSessionId).toBeUndefined();
    expect(ds.session.pendingForkSession).toBeUndefined();
    expect(ds.session.initialUserTurnPending).toBe(true);
    await vi.waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledOnce());
    expect(mocks.sendMessage.mock.calls[0]?.[2]).toBe('✅ 执行成功，下一条消息将开启新会话。');
  });

  it('resets a live session after forwarding /new', async () => {
    const send = vi.fn();
    const worker = Object.assign(new EventEmitter(), {
      killed: false,
      connected: true,
      exitCode: null,
      signalCode: null,
      send,
      kill: vi.fn(),
    }) as any;
    const ds = {
      session: {
        sessionId: 'session-live-new',
        chatId: 'oc_private',
        rootMessageId: 'om_private',
        title: 'private chat',
        status: 'active',
        createdAt: new Date().toISOString(),
        scope: 'chat',
        chatType: 'p2p',
        larkAppId: 'app-transfer-passthrough',
        ownerOpenId: 'ou_owner',
        workingDir: '/tmp',
        cliId: 'claude-code',
        cliSessionId: 'old-cli-session',
        lastCliInput: 'old input',
      },
      worker,
      workerPort: null,
      workerToken: null,
      larkAppId: 'app-transfer-passthrough',
      chatId: 'oc_private',
      chatType: 'p2p',
      scope: 'chat',
      spawnedAt: Date.now(),
      cliVersion: '1.0.0',
      lastMessageAt: Date.now(),
      hasHistory: true,
      pendingRepo: false,
      workingDir: '/tmp',
      lastScreenStatus: 'idle',
      lastCliInput: 'old input',
    } as DaemonSession;
    daemonActiveSessions.set(sessionKey('oc_private', ds.larkAppId), ds);

    deliverPassthrough(
      ds,
      '/new',
      '/new',
      'oc_private',
      ds.larkAppId,
      {
        messageId: 'om_live_new_turn',
        senderOpenId: 'ou_owner',
        senderIsBot: false,
        substitute: false,
      },
    );

    expect(send).toHaveBeenCalledWith({
      type: 'raw_input',
      content: '/new',
      turnId: 'om_live_new_turn',
    });
    expect(ds.hasHistory).toBe(false);
    expect(ds.lastCliInput).toBeUndefined();
    expect(ds.session.lastCliInput).toBeUndefined();
    expect(ds.session.cliSessionId).toBeUndefined();
    expect(ds.session.initialUserTurnPending).toBe(true);
    await vi.waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledOnce());
  });
});
