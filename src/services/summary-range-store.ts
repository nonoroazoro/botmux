import {
  getBot,
  type BotConfig,
  type SummaryRangeConfig,
} from '../bot-registry.js';
import { rmwBotEntry } from './config-store.js';
import { logger } from '../utils/logger.js';

export const DEFAULT_SUMMARY_LIMIT = 50;
export const DEFAULT_SUMMARY_SINCE_HOURS = 24;
export const DEFAULT_SUMMARY_PROMPT =
  'Summarize the configured conversation history in the user\'s language. For a topic group, cover only the current topic; for a regular group, cover the configured chat-history range. Include context, key discussion, conclusions, and action items. Omit unrelated private information.';

export interface SummaryRangePrefs {
  limit: number;
  sinceHours: number;
}

export type SummaryRangeUpdateResult = {
  ok: true;
  summaryRange: SummaryRangePrefs;
} | {
  ok: false;
  reason: string;
};

function toNonNegativeInt(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? raw : fallback;
}

function normalizedRangeFromConfig(raw: SummaryRangeConfig | undefined): SummaryRangePrefs | undefined {
  if (!raw) return undefined;
  return {
    limit: toNonNegativeInt(raw.limit, DEFAULT_SUMMARY_LIMIT),
    sinceHours: toNonNegativeInt(raw.sinceHours, DEFAULT_SUMMARY_SINCE_HOURS),
  };
}

export function defaultSummaryRangePrefs(): SummaryRangePrefs {
  return {
    limit: DEFAULT_SUMMARY_LIMIT,
    sinceHours: DEFAULT_SUMMARY_SINCE_HOURS,
  };
}

export function summaryRangeFromBotConfig(config: Pick<BotConfig, 'summaryRange'>): SummaryRangePrefs {
  return normalizedRangeFromConfig(config.summaryRange)
    ?? defaultSummaryRangePrefs();
}

type NormalizeSummaryRangeResult =
  | { ok: true; prefs: SummaryRangePrefs }
  | { ok: false; reason: string };

function normalizeSummaryRangePrefs(raw: unknown): NormalizeSummaryRangeResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'bad_json' };
  const body = raw as Record<string, unknown>;
  const limit = body.limit;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 0) return { ok: false, reason: 'invalid_limit' };
  const sinceHours = body.sinceHours;
  if (typeof sinceHours !== 'number' || !Number.isInteger(sinceHours) || sinceHours < 0) {
    return { ok: false, reason: 'invalid_since_hours' };
  }
  return { ok: true, prefs: { limit, sinceHours } };
}

export async function updateDashboardSummaryRange(
  larkAppId: string,
  rawBody: unknown,
): Promise<SummaryRangeUpdateResult> {
  const normalized = normalizeSummaryRangePrefs(rawBody);
  if (!normalized.ok) return normalized;
  const prefs = normalized.prefs;

  let bot;
  try { bot = getBot(larkAppId); } catch { return { ok: false, reason: 'bot_not_registered' }; }

  const r = await rmwBotEntry<SummaryRangePrefs>(larkAppId, (entry) => {
    entry.summaryRange = { limit: prefs.limit, sinceHours: prefs.sinceHours };
    return { write: true, result: prefs };
  });
  if (!r.ok) return { ok: false, reason: r.reason };

  bot.config.summaryRange = { limit: prefs.limit, sinceHours: prefs.sinceHours };
  logger.info(`[summary-range:${larkAppId}] dashboard summary range saved limit=${prefs.limit} sinceHours=${prefs.sinceHours}`);
  return { ok: true, summaryRange: summaryRangeFromBotConfig(bot.config) };
}
