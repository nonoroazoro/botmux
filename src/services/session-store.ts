import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { cleanupMaterializedDashboardImages } from '../core/dashboard-images.js';
import { deleteFrozenCards } from './frozen-card-store.js';
import type { Session } from '../types.js';

let sessions: Map<string, Session> = new Map();
let loaded = false;
let currentAppId: string | undefined;

/**
 * Initialise session store for a specific bot (multi-daemon mode).
 * Sessions are stored in `sessions-{appId}.json`.
 */
export function init(appId: string): void {
  if (!appId || /[\\/]/.test(appId) || appId === '.' || appId === '..') {
    throw new Error('Session store requires a valid bot appId');
  }
  currentAppId = appId;
  loaded = false;
  sessions = new Map();
}

function getFilePath(): string {
  if (!currentAppId) throw new Error('Session store must be initialized with a bot appId');
  const fileName = `sessions-${currentAppId}.json`;
  return join(config.session.dataDir, fileName);
}

function ensureDir(): void {
  const dir = dirname(getFilePath());
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function load(): void {
  if (loaded) return;
  ensureDir();
  const fp = getFilePath();
  if (existsSync(fp)) {
    try {
      const data = JSON.parse(readFileSync(fp, 'utf-8'));
      sessions = new Map(Object.entries(data));
    } catch (err) {
      logger.error(`Failed to load sessions: ${err}`);
      sessions = new Map();
      loaded = true;
      return;
    }
    logger.info(`Loaded ${sessions.size} sessions from ${fp}`);
  }
  loaded = true;
}

function readExistingSessionsFromDisk(fp: string): { raw: string; parsed: Record<string, Session> } {
  if (!existsSync(fp)) return { raw: '', parsed: {} };
  try {
    const raw = readFileSync(fp, 'utf-8');
    return { raw, parsed: JSON.parse(raw) as Record<string, Session> };
  } catch {
    return { raw: '', parsed: {} };
  }
}

function save(): void {
  ensureDir();
  const fp = getFilePath();
  const { raw: existingRaw } = readExistingSessionsFromDisk(fp);
  const obj: Record<string, Session> = {};
  for (const [k, v] of sessions) {
    obj[k] = v;
  }
  const json = JSON.stringify(obj, null, 2);
  // The daemon fires several updateSession()/save() calls per inbound message
  // (activity bump, pid, stream-card state, …) and many leave the serialized
  // file byte-identical. Skipping the temp-file write + rename in that case
  // elides the bulk of the redundant disk I/O — and writing identical bytes is
  // a guaranteed no-op, so this can't drop state or race a concurrent writer
  // (we compare against what's actually on disk right now).
  if (json === existingRaw) return;
  const tmpFp = `${fp}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tmpFp, json, 'utf-8');
  renameSync(tmpFp, fp);
}

export function createSession(
  chatId: string,
  rootMessageId: string,
  title: string,
  chatType?: 'group' | 'p2p',
  scope?: 'thread' | 'chat',
): Session {
  load();
  const session: Session = {
    sessionId: randomUUID(),
    chatId,
    chatType,
    rootMessageId,
    scope,
    title,
    status: 'active',
    createdAt: new Date().toISOString(),
  };
  sessions.set(session.sessionId, session);
  save();
  logger.info(`Created session ${session.sessionId} (thread: ${rootMessageId})`);
  return session;
}

export function getSession(sessionId: string): Session | undefined {
  load();
  return sessions.get(sessionId) ?? findInOtherFiles(sessionId);
}

const bridgeMarkerCleanupFences = new Map<string, Promise<void>>();

export function registerSessionBridgeSendMarkerCleanupFence(
  sessionId: string,
  fence: Promise<void>,
): void {
  bridgeMarkerCleanupFences.set(sessionId, fence);
  void fence.then(
    () => {
      if (bridgeMarkerCleanupFences.get(sessionId) === fence) {
        bridgeMarkerCleanupFences.delete(sessionId);
      }
    },
    () => {
      if (bridgeMarkerCleanupFences.get(sessionId) === fence) {
        bridgeMarkerCleanupFences.delete(sessionId);
      }
    },
  );
}

/**
 * Return a row only when it belongs to this process's currently-initialised
 * bot store. Mutating daemon endpoints must use this instead of getSession(),
 * whose cross-file fallback is intentionally read-only discovery.
 */
export function getOwnedSession(sessionId: string): Session | undefined {
  load();
  return sessions.get(sessionId);
}

/**
 * Search all session files for a session not found in the current file.
 *
 * Sessions are partitioned per-bot (sessions-<larkAppId>.json), but agent-
 * facing CLI subcommands (`botmux send`, etc.) may be invoked in contexts
 * where LARK_APP_ID isn't set, so they can't pick the right file directly.
 * Scanning all files is safe — these callers only read sessions.
 */
function findInOtherFiles(sessionId: string): Session | undefined {
  const dataDir = config.session.dataDir;
  const currentFp = getFilePath();
  try {
    for (const file of readdirSync(dataDir)) {
      if (!file.startsWith('sessions-') || !file.endsWith('.json')) continue;
      const fp = join(dataDir, file);
      if (fp === currentFp) continue;
      try {
        const data: Record<string, Session> = JSON.parse(readFileSync(fp, 'utf-8'));
        if (data[sessionId]) return data[sessionId];
      } catch { continue; }
    }
  } catch { /* ignore */ }
  return undefined;
}

export function cleanupSessionBridgeSendMarkersNow(sessionId: string): void {
  try { unlinkSync(join(config.session.dataDir, 'turn-sends', `${sessionId}.jsonl`)); } catch { /* absent/best effort */ }
}

export function cleanupSessionBridgeSendMarkers(sessionId: string): void {
  const fence = bridgeMarkerCleanupFences.get(sessionId);
  if (fence) {
    void fence.then(
      () => cleanupSessionBridgeSendMarkersNow(sessionId),
      () => cleanupSessionBridgeSendMarkersNow(sessionId),
    );
    return;
  }
  cleanupSessionBridgeSendMarkersNow(sessionId);
}

export function closeSession(
  sessionId: string,
  opts: { cleanupBridgeMarkers?: boolean } = {},
): void {
  load();
  const session = sessions.get(sessionId);
  if (session) {
    if (session.larkAppId && session.dashboardAttachments?.length) {
      try {
        cleanupMaterializedDashboardImages(session.larkAppId, session.dashboardAttachments);
        session.dashboardAttachments = undefined;
        session.queuedAttachments = undefined;
      } catch (error: any) {
        logger.warn(`Failed to clean Dashboard images for session ${sessionId}: ${error?.message ?? error}`);
      }
    }
    session.status = 'closed';
    session.closedAt = new Date().toISOString();
    save();
    // turn-sends was originally a transient bridge-dedup file cleaned by a
    // live worker's close handler. Message previews now make its bounded tail
    // user-visible, so workerless/forced closes must apply the same cleanup;
    // otherwise closed sessions retain private reply text indefinitely.
    if (opts.cleanupBridgeMarkers !== false) cleanupSessionBridgeSendMarkers(sessionId);
    deleteFrozenCards(sessionId);
    logger.info(`Closed session ${sessionId}`);
  }
}

export function updateSessionPid(sessionId: string, pid: number | null): void {
  load();
  const session = sessions.get(sessionId);
  if (session) {
    session.pid = pid ?? undefined;
    save();
  }
}

export function updateSession(session: Session): void {
  load();
  sessions.set(session.sessionId, session);
  save();
}

export function listSessions(): Session[] {
  load();
  return [...sessions.values()];
}

/**
 * Cross-file lookup: find every active session attached to a thread, across
 * all bots. Used when a not-yet-initialized bot is mentioned in a thread that
 * another bot has already pinned to a working directory — the new bot inherits
 * the pinned dir instead of re-prompting the user for repo selection.
 *
 * Reads other bots' session files directly (best-effort) instead of relying on
 * any in-memory state, since each daemon process only owns its own bot.
 */
export function findActiveSessionsByRoot(rootMessageId: string): Session[] {
  return findActiveSessionsMatching(s => s.rootMessageId === rootMessageId);
}

/**
 * Cross-file lookup: find every active chat-scope session for a chat, across
 * all bots. Mirror of findActiveSessionsByRoot for chat-scope (普通群整群一会话):
 * lets a not-yet-initialised bot inherit the workingDir from a peer bot that
 * already has a chat-scope session in the same chat, so a `botmux send
 * --mention <other-bot>` in 普通群 can spawn the second bot without bouncing
 * through the repo-select card.
 *
 * Only returns scope='chat' sessions — thread-scope sessions in the same chat
 * are routed by rootMessageId and not eligible for chat-scope inheritance.
 */
export function findActiveChatScopeSessionsByChat(chatId: string): Session[] {
  return findActiveSessionsMatching(s => s.chatId === chatId && s.scope === 'chat');
}

/**
 * Count active sessions across every bot's on-disk session file. A pure disk
 * read (no in-memory state) so it's correct at daemon startup regardless of
 * which bot owns this process — used by the restart-report DM after a restart.
 */
export function countActiveSessionsOnDisk(dataDir: string = config.session.dataDir): number {
  let n = 0;
  try {
    for (const file of readdirSync(dataDir)) {
      if (!file.startsWith('sessions-') || !file.endsWith('.json')) continue;
      try {
        const data: Record<string, Session> = JSON.parse(readFileSync(join(dataDir, file), 'utf-8'));
        for (const s of Object.values(data)) if (s?.status === 'active') n++;
      } catch { continue; }
    }
  } catch { /* missing dir → 0 */ }
  return n;
}

/**
 * Collect every CLI session identity botmux has ever recorded — across ALL bot
 * store files, ANY status (active or closed). Returns both each session's
 * botmux `sessionId` (which, for claude-family, IS the on-disk jsonl filename
 * since botmux spawns with `--session-id <id>`) and its `cliSessionId` (the
 * CLI-native id after any resume/rotation, e.g. a codex/traex rollout id).
 *
 * Used by `/adopt`'s resume-import discovery to hide sessions botmux already
 * manages — live OR closed — so the picker surfaces only genuinely external
 * sessions (a CLI the user ran standalone). Closed botmux sessions remain
 * resumable via their own session-closed cards.
 */
export function collectBotmuxSessionIdentities(dataDir: string = config.session.dataDir): Set<string> {
  const ids = new Set<string>();
  const add = (s: Session | undefined) => {
    if (!s) return;
    if (s.sessionId) ids.add(s.sessionId);
    if (s.cliSessionId) ids.add(s.cliSessionId);
  };
  // In-memory first (freshest — covers ids not yet flushed to disk).
  load();
  for (const s of sessions.values()) add(s);
  // Then every bot's persisted store file (other daemons own their own files).
  try {
    for (const file of readdirSync(dataDir)) {
      if (!file.startsWith('sessions-') || !file.endsWith('.json')) continue;
      try {
        const data: Record<string, Session> = JSON.parse(readFileSync(join(dataDir, file), 'utf-8'));
        for (const s of Object.values(data)) add(s);
      } catch { continue; }
    }
  } catch { /* missing dir → in-memory only */ }
  return ids;
}

function findActiveSessionsMatching(predicate: (s: Session) => boolean): Session[] {
  load();
  const matches: Session[] = [];
  for (const s of sessions.values()) {
    if (predicate(s) && s.status === 'active') matches.push(s);
  }
  const dataDir = config.session.dataDir;
  const currentFp = getFilePath();
  try {
    for (const file of readdirSync(dataDir)) {
      if (!file.startsWith('sessions-') || !file.endsWith('.json')) continue;
      const fp = join(dataDir, file);
      if (fp === currentFp) continue;
      try {
        const data: Record<string, Session> = JSON.parse(readFileSync(fp, 'utf-8'));
        for (const s of Object.values(data)) {
          if (predicate(s) && s.status === 'active') matches.push(s);
        }
      } catch { continue; }
    }
  } catch { /* ignore */ }
  return matches;
}
