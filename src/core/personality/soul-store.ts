import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readSecureHostFileSync,
  unlinkSecureHostFileSync,
  writeSecureHostFileSync,
} from '../../platform/secure-host-file.js';
import { resolveBotmuxDataDir } from '../data-dir.js';

export const MAX_SOUL_BYTES = 32 * 1024;

export type SoulSource = 'default' | 'custom';

export interface ResolvedSoul {
  content: string;
  source: SoulSource;
  revision: string;
  /** Invalid custom content was ignored and the built-in Soul is active. */
  customError?: string;
}

const BOT_ID_RE = /^[A-Za-z0-9_-]{1,160}$/u;
const DEFAULT_SOUL_PATH = fileURLToPath(new URL('./default-soul.md', import.meta.url));
const DEFAULT_SOUL = readFileSync(DEFAULT_SOUL_PATH, 'utf8').trim();

function assertBotId(larkAppId: string): void {
  if (!BOT_ID_RE.test(larkAppId)) throw new Error('invalid_bot_id');
}

/** Host-only root for owner-managed Soul files. */
export function soulStoreRoot(dataDir: string): string {
  return join(dataDir, 'owner', 'souls');
}

function soulFilePath(larkAppId: string, dataDir: string): string {
  assertBotId(larkAppId);
  return join(soulStoreRoot(dataDir), `${larkAppId}.md`);
}

function normalizeSoulContent(content: string): string {
  const normalized = content.trim();
  if (!normalized) throw new Error('soul_content_required');
  if (Buffer.byteLength(normalized, 'utf8') > MAX_SOUL_BYTES) {
    throw new Error(`soul_content_too_large:${MAX_SOUL_BYTES}`);
  }
  return normalized;
}

function soulRevision(source: SoulSource, content: string): string {
  return createHash('sha256')
    .update('botmux-soul-v1')
    .update('\0')
    .update(source)
    .update('\0')
    .update(content)
    .digest('hex');
}

function defaultSoul(customError?: string): ResolvedSoul {
  return {
    content: DEFAULT_SOUL,
    source: 'default',
    revision: soulRevision('default', DEFAULT_SOUL),
    ...(customError ? { customError } : {}),
  };
}

export function resolveSoul(
  larkAppId: string,
  dataDir = resolveBotmuxDataDir(),
): ResolvedSoul {
  const path = soulFilePath(larkAppId, dataDir);
  try {
    const raw = readSecureHostFileSync(path, MAX_SOUL_BYTES + 1);
    if (raw === null) return defaultSoul();
    const content = normalizeSoulContent(raw);
    return { content, source: 'custom', revision: soulRevision('custom', content) };
  } catch (error) {
    return defaultSoul(error instanceof Error ? error.message : 'soul_read_failed');
  }
}

export function writeSoul(
  larkAppId: string,
  content: string,
  dataDir = resolveBotmuxDataDir(),
): ResolvedSoul {
  const normalized = normalizeSoulContent(content);
  const path = soulFilePath(larkAppId, dataDir);
  writeSecureHostFileSync(path, `${normalized}\n`);
  return { content: normalized, source: 'custom', revision: soulRevision('custom', normalized) };
}

export function resetSoul(
  larkAppId: string,
  dataDir = resolveBotmuxDataDir(),
): ResolvedSoul {
  const path = soulFilePath(larkAppId, dataDir);
  unlinkSecureHostFileSync(path);
  return resolveSoul(larkAppId, dataDir);
}
