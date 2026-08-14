import { fetchDaemonIpc } from '../../core/daemon-ipc-auth.js';
import { findOnlineDaemon } from '../../utils/daemon-discovery.js';
import { renderPublishedPoll } from './service.js';

export async function refreshPollCard(input: {
  pollId: string;
  ownerLarkAppId: string;
  currentLarkAppId: string;
}): Promise<boolean> {
  if (input.ownerLarkAppId === input.currentLarkAppId) {
    await renderPublishedPoll(input.pollId, input.ownerLarkAppId);
    return true;
  }
  const daemon = findOnlineDaemon(input.ownerLarkAppId);
  if (!daemon) return false;
  const response = await fetchDaemonIpc(
    daemon.ipcPort,
    `/api/polls/${encodeURIComponent(input.pollId)}/render`,
    { method: 'POST' },
  );
  if (!response.ok) return false;
  const payload = await response.json().catch(() => ({})) as { ok?: unknown };
  return payload.ok === true;
}
