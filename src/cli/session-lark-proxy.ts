import { resolveBotmuxDataDir } from '../core/data-dir.js';
import { fetchDaemonIpc, loadDaemonIpcSecret } from '../core/daemon-ipc-auth.js';
import { readManagedOriginCapability } from '../core/managed-origin-capability.js';
import { resolveDaemonIpcPort } from '../utils/daemon-discovery.js';

export async function requestSessionLarkProxy(input: {
  operation: 'lark-history' | 'lark-quoted';
  sessionId?: string;
  body: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
}): Promise<Record<string, unknown>> {
  const env = input.env ?? process.env;
  const sessionId = input.sessionId ?? env.BOTMUX_SESSION_ID;
  if (!sessionId) throw new Error('无法确定当前 session-id');

  const port = resolveDaemonIpcPort(undefined, env.BOTMUX_DAEMON_IPC_PORT);
  if (!port) throw new Error('无法定位当前 session 所属 daemon IPC');

  const relayDir = env.BOTMUX_SEND_RELAY;
  const claim = readManagedOriginCapability(
    resolveBotmuxDataDir({ env }),
    sessionId,
    relayDir,
  );
  const path = `/api/sessions/${encodeURIComponent(sessionId)}/${input.operation}`;
  const request = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...input.body,
      originCapability: claim?.capability,
      originTurnId: claim?.turnId,
      originDispatchAttempt: claim?.dispatchAttempt,
    }),
  } satisfies RequestInit;

  let hostSecret: string | undefined;
  if (!relayDir) {
    try { hostSecret = loadDaemonIpcSecret(); } catch { /* read-isolated CLI */ }
  }
  const response = hostSecret
    ? await fetchDaemonIpc(port, path, request, hostSecret)
    : await fetch(`http://127.0.0.1:${port}${path}`, request);
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || payload.ok !== true) {
    const reason = typeof payload.error === 'string'
      ? payload.error
      : `daemon HTTP ${response.status}`;
    throw new Error(reason);
  }
  return payload;
}
