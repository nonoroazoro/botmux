import { afterEach, describe, expect, it, vi } from 'vitest';

import * as botRegistry from '../src/bot-registry.js';
import {
  setIpcAuthSecret,
  startIpcServer,
  type IpcServerHandle,
} from '../src/core/dashboard-ipc-server.js';
import * as workerPool from '../src/core/worker-pool.js';
import * as quotedRender from '../src/cli/quoted-render.js';
import * as larkClient from '../src/im/lark/client.js';
import * as messageParser from '../src/im/lark/message-parser.js';

const CAPABILITY = 'a11ce123'.repeat(8);
const APP_ID = 'cli_test';
const CHAT_ID = 'oc_test';
const SESSION_ID = 'session-test';
const HOST_SECRET = 'ipc-lark-read-host-secret';

let handle: IpcServerHandle | null = null;

afterEach(async () => {
  if (handle) await handle.close();
  handle = null;
  setIpcAuthSecret(null);
  vi.restoreAllMocks();
});

async function post(operation: 'lark-history' | 'lark-quoted', body: Record<string, unknown>): Promise<Response> {
  if (!handle) {
    setIpcAuthSecret(HOST_SECRET);
    handle = await startIpcServer({
      port: 0,
      host: '127.0.0.1',
      authRequired: true,
    });
  }
  return fetch(`http://127.0.0.1:${handle.port}/api/sessions/${SESSION_ID}/${operation}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ originCapability: CAPABILITY, ...body }),
  });
}

function mockSession(): void {
  vi.spyOn(workerPool, 'findActiveBySessionId').mockReturnValue({
    session: {
      sessionId: SESSION_ID,
      larkAppId: APP_ID,
      chatId: CHAT_ID,
      rootMessageId: CHAT_ID,
      scope: 'chat',
    },
    larkAppId: APP_ID,
    chatId: CHAT_ID,
    rootMessageId: CHAT_ID,
    managedTurnOrigin: { capability: CAPABILITY },
  } as any);
  vi.spyOn(botRegistry, 'getBot').mockReturnValue({
    config: { larkAppId: APP_ID, larkAppSecret: 'host-only', cliId: 'codex' },
  } as any);
}

describe('session-scoped Lark read IPC', () => {
  it('reads only the authenticated chat without exposing credentials', async () => {
    mockSession();
    const list = vi.spyOn(larkClient, 'listChatMessages').mockResolvedValue([{}]);
    vi.spyOn(messageParser, 'parseApiMessage').mockReturnValue({
      messageId: 'om_one',
      rootId: CHAT_ID,
      senderId: 'ou_sender',
      senderType: 'user',
      msgType: 'text',
      content: 'issue context',
      createTime: '1',
    } as any);

    const response = await post('lark-history', { scope: 'session', limit: 20 });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      sessionId: SESSION_ID,
      chatId: CHAT_ID,
      scope: 'chat',
      messages: [{ messageId: 'om_one', content: 'issue context' }],
    });
    expect(list).toHaveBeenCalledWith(APP_ID, CHAT_ID, 20);
  });

  it('rejects a stale capability before any Lark read', async () => {
    mockSession();
    vi.spyOn(workerPool, 'findActiveBySessionId').mockReturnValue({
      session: { sessionId: SESSION_ID },
      managedTurnOrigin: { capability: 'bad0'.repeat(16) },
    } as any);
    const list = vi.spyOn(larkClient, 'listChatMessages');

    const response = await post('lark-history', { scope: 'chat' });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, error: 'origin_unproven' });
    expect(list).not.toHaveBeenCalled();
  });

  it('rejects quoted message ids from another chat', async () => {
    mockSession();
    vi.spyOn(larkClient, 'getMessageChatId').mockResolvedValue('oc_other');
    const getDetail = vi.spyOn(larkClient, 'getMessageDetail');

    const response = await post('lark-quoted', { messageId: 'om_external' });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: 'message_outside_session_chat',
    });
    expect(getDetail).not.toHaveBeenCalled();
  });

  it('returns a quoted message from the authenticated chat', async () => {
    mockSession();
    vi.spyOn(larkClient, 'getMessageChatId').mockResolvedValue(CHAT_ID);
    vi.spyOn(larkClient, 'getMessageDetail').mockResolvedValue({ items: [{}] });
    vi.spyOn(quotedRender, 'renderQuotedMessage').mockResolvedValue({
      messageId: 'om_local',
      content: 'quoted context',
      resources: [],
    } as any);

    const response = await post('lark-quoted', { messageId: 'om_local' });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      messageId: 'om_local',
      content: 'quoted context',
    });
  });
});
