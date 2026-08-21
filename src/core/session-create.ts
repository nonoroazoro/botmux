// Pure logic for dashboard session creation: request validation, mode and
// column normalization, role context, and title derivation.
import { t, type Locale } from '../i18n/index.js';
import { instruction } from '../prompts.js';
import type { CliTurnPayload } from '../types.js';
import { parseDashboardImageUploads, type DashboardImageUpload } from './dashboard-images.js';

/**
 * Collaboration mode.
 * - `all`: start one session per selected bot with the same request.
 * - `lead`: start only the lead bot and let it delegate when useful.
 */
export const CREATE_SESSION_MODES = ['all', 'lead'] as const;
export type CreateSessionMode = (typeof CREATE_SESSION_MODES)[number];

/**
 * Dashboard column for a newly created session.
 * - `in_progress`: start immediately.
 * - `backlog`: park without starting a CLI.
 */
export const CREATE_SESSION_COLUMNS = ['in_progress', 'backlog'] as const;
export type CreateSessionColumn = (typeof CREATE_SESSION_COLUMNS)[number];

/**
 * Role used to wrap a bot's opening prompt in a newly created chat.
 */
export type SpawnRole = 'solo' | 'lead' | 'collab';
export const SPAWN_ROLES: readonly SpawnRole[] = ['solo', 'lead', 'collab'];

const TITLE_MAX = 50;

export interface Coworker {
  name: string;
  openId?: string;
}

export function normalizeCreateMode(value: unknown): CreateSessionMode | null {
  return typeof value === 'string' && (CREATE_SESSION_MODES as readonly string[]).includes(value)
    ? (value as CreateSessionMode)
    : null;
}

export function normalizeCreateColumn(value: unknown): CreateSessionColumn | null {
  return typeof value === 'string' && (CREATE_SESSION_COLUMNS as readonly string[]).includes(value)
    ? (value as CreateSessionColumn)
    : null;
}

function normalizeSpawnRole(value: unknown): SpawnRole | null {
  return typeof value === 'string' && (SPAWN_ROLES as readonly string[]).includes(value)
    ? (value as SpawnRole)
    : null;
}

/**
 * Derive a bounded session title from the first non-empty content line.
 */
export function deriveSessionTitleFromContent(content: string): string {
  const firstLine = content.split(/\r?\n/).map(s => s.trim()).find(Boolean) ?? '';
  if (!firstLine) return t('cmd.createSession.untitled');
  return firstLine.length > TITLE_MAX ? firstLine.slice(0, TITLE_MAX) + '…' : firstLine;
}

/** Dashboard group name follows the same visible first-line rule as the
 * session title. Keeping it here prevents the browser placeholder and the
 * actual Lark chat name from drifting apart. */
export function deriveCreateGroupName(explicitName: unknown, content: string): string {
  if (typeof explicitName === 'string' && explicitName.trim()) return explicitName.trim().slice(0, 60);
  return deriveSessionTitleFromContent(content).slice(0, 60);
}

/** Decide which already-joined bots receive the opening turn. The content is
 * intentionally absent from this decision: an @sub inside Lead instructions
 * must not wake that sub before the Lead delegates. */
export function selectCreateSessionTargets(
  mode: CreateSessionMode,
  joinedIds: readonly string[],
  leadLarkAppId?: string,
): string[] {
  if (mode === 'lead') return leadLarkAppId && joinedIds.includes(leadLarkAppId) ? [leadLarkAppId] : [];
  return [...joinedIds];
}

function coworkerListBlock(coworkers: Coworker[]): string {
  return coworkers
    .map(c => c.openId ? `- ${c.name} (open_id: ${c.openId})` : `- ${c.name}`)
    .join('\n');
}

/**
 * Build trusted orchestration context for a lead bot.
 */
export function buildLeadDispatchPreamble(coworkers: Coworker[], locale?: Locale): string {
  void locale;
  const intro = instruction('session.lead_intro');
  const outro = instruction('session.lead_outro');
  const list = coworkers.length > 0
    ? coworkerListBlock(coworkers)
    : instruction('session.no_sub_bots');
  return `<botmux_lead_dispatch>\n${intro}\n${list}\n${outro}\n</botmux_lead_dispatch>`;
}

/**
 * Build trusted peer context for parallel collaborators.
 */
export function buildCollabNote(coworkers: Coworker[], locale?: Locale): string {
  void locale;
  const others = coworkers.filter(c => c.name);
  if (others.length === 0) return '';
  const names = others.map(c => c.name).join(', ');
  return `<botmux_collab>${instruction('session.collaboration', { peers: names })}</botmux_collab>`;
}

/** System-generated dashboard role context kept separate from the human task
 * for Codex App clean-input materialization. Legacy CLIs still receive the
 * concatenated string from composeSpawnUserContent(). */
export function composeSpawnCodexAppContext(args: {
  role: SpawnRole;
  coworkers?: Coworker[];
  locale?: Locale;
}): string | undefined {
  const coworkers = args.coworkers ?? [];
  if (args.role === 'lead') return buildLeadDispatchPreamble(coworkers, args.locale);
  if (args.role === 'collab') return buildCollabNote(coworkers, args.locale) || undefined;
  return undefined;
}

/**
 * Compose role context and the unmodified user request for a new session.
 */
export function composeSpawnUserContent(args: {
  content: string;
  role: SpawnRole;
  coworkers?: Coworker[];
  locale?: Locale;
}): string {
  const context = composeSpawnCodexAppContext(args);
  return context ? `${context}\n\n${args.content}` : args.content;
}

/** Merge a parked dashboard task with the first message that activates it.
 * The legacy prompt combines queuedPrompt + current wrapped prompt elsewhere;
 * this helper independently combines only raw user texts and metadata-only
 * contexts so the visible Codex App turn neither drops nor duplicates the
 * original dashboard task. */
export function mergeQueuedCodexAppTurn(args: {
  queued: boolean;
  queuedText?: string;
  queuedMessageContext?: string;
  currentText: string;
  currentMessageContext?: string;
}): { text: string; messageContext?: string } {
  if (!args.queued) {
    return {
      text: args.currentText,
      ...(args.currentMessageContext ? { messageContext: args.currentMessageContext } : {}),
    };
  }
  const text = [args.queuedText, args.currentText].filter(Boolean).join('\n\n') || args.currentText;
  const messageContext = [args.queuedMessageContext, args.currentMessageContext].filter(Boolean).join('\n\n');
  return { text, ...(messageContext ? { messageContext } : {}) };
}

/** Final compatibility gate for a queued dashboard task activated by a topic
 * reply. Sessions parked before clean-input was introduced have queuedPrompt
 * but no queuedCodexAppText. Their legacy content already contains both the
 * queued task and the current reply, while the newly-built structured sidecar
 * can only contain the current reply. Remove that incomplete sidecar so Codex
 * App consumes the complete legacy prompt instead.
 *
 * A valid string field (including an explicitly stored empty string) identifies
 * the new schema. Missing, null, or malformed persisted values fail closed to
 * legacy content. Non-Codex payloads have no sidecar and remain unchanged. */
export function applyQueuedCodexAppLegacyFallback(
  payload: CliTurnPayload,
  args: { queued: boolean; queuedText?: unknown },
): CliTurnPayload {
  if (!args.queued || typeof args.queuedText === 'string' || !payload.codexAppInput) return payload;
  return { content: payload.content };
}

export interface SpawnRequest {
  chatId: string;
  content: string;
  column: CreateSessionColumn;
  role: SpawnRole;
  coworkers: Coworker[];
  ownerOpenId?: string;
  ownerUnionId?: string;
  title?: string;
  images: DashboardImageUpload[];
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function parseCoworkers(value: unknown): Coworker[] {
  if (!Array.isArray(value)) return [];
  const out: Coworker[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const name = (item as any).name;
    const openId = (item as any).openId;
    if (typeof name !== 'string' || !name.trim()) continue;
    out.push({
      name: name.trim(),
      openId: typeof openId === 'string' && openId.trim() ? openId.trim() : undefined,
    });
  }
  return out;
}

/** 校验 daemon /api/sessions/spawn 的请求体。content 去尾空白后不能为空、限长；
 *  chatId 必须是飞书群 id（oc_ 前缀）；column/role 必须合法。 */
export function parseSpawnRequest(body: unknown): ParseResult<SpawnRequest> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'bad_request' };
  const b = body as Record<string, unknown>;
  const chatId = typeof b.chatId === 'string' ? b.chatId.trim() : '';
  if (!chatId.startsWith('oc_')) return { ok: false, error: 'bad_chat_id' };
  const rawContent = typeof b.content === 'string' ? b.content : '';
  const content = rawContent.replace(/\s+$/u, '');
  if (!content.trim()) return { ok: false, error: 'empty_content' };
  const column = normalizeCreateColumn(b.column);
  if (!column) return { ok: false, error: 'bad_column' };
  const role = normalizeSpawnRole(b.role);
  if (!role) return { ok: false, error: 'bad_role' };
  const title = typeof b.title === 'string' && b.title.trim() ? b.title.trim().slice(0, 200) : undefined;
  const parsedImages = parseDashboardImageUploads(b.images);
  if (!parsedImages.ok) return { ok: false, error: parsedImages.error };
  return {
    ok: true,
    value: {
      chatId,
      content,
      column,
      role,
      coworkers: parseCoworkers(b.coworkers),
      ownerOpenId: typeof b.ownerOpenId === 'string' && b.ownerOpenId.trim() ? b.ownerOpenId.trim() : undefined,
      ownerUnionId: typeof b.ownerUnionId === 'string' && b.ownerUnionId.trim() ? b.ownerUnionId.trim() : undefined,
      title,
      images: parsedImages.images,
    },
  };
}
