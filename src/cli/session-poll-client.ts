import { resolveBotmuxDataDir } from '../core/data-dir.js';
import { fetchDaemonIpc, loadDaemonIpcSecret } from '../core/daemon-ipc-auth.js';
import { readManagedOriginCapability } from '../core/managed-origin-capability.js';
import { resolveDaemonIpcPort } from '../utils/daemon-discovery.js';

export async function requestSessionPoll(input: {
  operation: 'create' | 'vote';
  sessionId?: string;
  body: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
}): Promise<Record<string, unknown>> {
  const env = input.env ?? process.env;
  const sessionId = input.sessionId ?? env.BOTMUX_SESSION_ID;
  if (!sessionId) throw new Error('Unable to determine the current session id');
  const port = resolveDaemonIpcPort(undefined, env.BOTMUX_DAEMON_IPC_PORT);
  if (!port) throw new Error('Unable to locate the current session daemon');
  const relayDir = env.BOTMUX_SEND_RELAY;
  const claim = readManagedOriginCapability(resolveBotmuxDataDir({ env }), sessionId, relayDir);
  const suffix = input.operation === 'create' ? 'polls' : 'poll-vote';
  const path = `/api/sessions/${encodeURIComponent(sessionId)}/${suffix}`;
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
    try { hostSecret = loadDaemonIpcSecret(); } catch { /* read-isolated session */ }
  }
  const response = hostSecret
    ? await fetchDaemonIpc(port, path, request, hostSecret)
    : await fetch(`http://127.0.0.1:${port}${path}`, request);
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || payload.ok !== true) {
    const reason = typeof payload.error === 'string' ? payload.error : `daemon HTTP ${response.status}`;
    throw new Error(reason);
  }
  return payload;
}
