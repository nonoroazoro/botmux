import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';

import { getBot, type MultiUserIsolationConfig } from '../bot-registry.js';
import { logger } from '../utils/logger.js';
import { rmwBotEntry } from './config-store.js';

export interface MultiUserIsolationUpdate {
  enabled: boolean;
  root: string;
  ownerOnlyTopics: boolean;
  sharedCodexHome?: string;
  defaultGitIdentity?: { name: string; email: string };
  groupOpen: boolean;
  p2pOpen: boolean;
}

function expandHome(path: string): string {
  return path.replace(/^~(?=\/|$)/u, homedir());
}

export async function updateBotMultiUserIsolation(
  larkAppId: string,
  input: MultiUserIsolationUpdate,
): Promise<{ ok: true; config?: MultiUserIsolationConfig; groupOpen: boolean; p2pOpen: boolean } | { ok: false; reason: string }> {
  let bot;
  try { bot = getBot(larkAppId); } catch { return { ok: false, reason: 'bot_not_registered' }; }

  const root = resolve(expandHome(input.root.trim()));
  if (!input.root.trim() || !isAbsolute(root) || root === '/') return { ok: false, reason: 'invalid_root' };
  const sharedCodexHome = input.sharedCodexHome?.trim()
    ? resolve(expandHome(input.sharedCodexHome.trim()))
    : undefined;
  const identity = input.defaultGitIdentity;
  if (identity && (!identity.name.trim() || !identity.email.trim() || /[\r\n]/u.test(identity.name + identity.email))) {
    return { ok: false, reason: 'invalid_git_identity' };
  }

  const config: MultiUserIsolationConfig | undefined = input.enabled
    ? {
        enabled: true,
        root,
        ownerOnlyTopics: input.ownerOnlyTopics,
        sharedCodexHome,
        defaultGitIdentity: identity
          ? { name: identity.name.trim(), email: identity.email.trim() }
          : undefined,
      }
    : undefined;

  const r = await rmwBotEntry(larkAppId, entry => {
    if (config) entry.multiUserIsolation = config;
    else delete entry.multiUserIsolation;
    if (input.groupOpen) entry.groupOpen = true;
    else delete entry.groupOpen;
    if (input.p2pOpen) entry.p2pOpen = true;
    else delete entry.p2pOpen;
    return { write: true, result: true };
  });
  if (!r.ok) return { ok: false, reason: r.reason };

  if (config) bot.config.multiUserIsolation = config;
  else delete bot.config.multiUserIsolation;
  bot.config.groupOpen = input.groupOpen || undefined;
  bot.config.p2pOpen = input.p2pOpen || undefined;
  logger.info(`[multi-user:${larkAppId}] enabled=${input.enabled} groupOpen=${input.groupOpen} p2pOpen=${input.p2pOpen}`);
  return { ok: true, config, groupOpen: input.groupOpen, p2pOpen: input.p2pOpen };
}
