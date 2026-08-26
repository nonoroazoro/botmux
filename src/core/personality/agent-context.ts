import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getBot } from '../../bot-registry.js';
import { resolveRole } from '../role-resolver.js';
import { personalityReactionsEnabled } from './reaction-config.js';
import { REACTION_TURN_REMINDER } from './reaction-turn-reminder.js';
import { resolveSoul } from './soul-store.js';

export interface AgentContext {
  block: string;
  reactionReminder: string;
  revision: string;
}

const REACTION_POLICY_PATH = fileURLToPath(new URL('./reaction-policy.md', import.meta.url));
const REACTION_POLICY = readFileSync(REACTION_POLICY_PATH, 'utf8').trim();

function reactionsEnabled(larkAppId: string): boolean {
  try {
    const config = getBot(larkAppId).config;
    return personalityReactionsEnabled(config);
  } catch {
    return false;
  }
}

export function resolveAgentContext(larkAppId: string, chatId: string): AgentContext {
  const soul = resolveSoul(larkAppId);
  const role = resolveRole(larkAppId, chatId);
  const reactionEnabled = reactionsEnabled(larkAppId);
  const reactionPolicy = reactionEnabled ? REACTION_POLICY : '';
  const roleContext = role.source === 'team' ? 'team' : 'group';
  const block = [
    `<personality source="${soul.source}">\n<soul>\n${soul.content}\n</soul>${reactionPolicy ? `\n<reaction_policy>\n${reactionPolicy}\n</reaction_policy>` : ''}\n</personality>`,
    role.content
      ? `<role context="${roleContext}" chat_id="${chatId}">\n${role.content}\n</role>`
      : '',
  ].filter(Boolean).join('\n\n');
  const revision = createHash('sha256')
    .update('botmux-agent-context-v1')
    .update('\0')
    .update(block)
    .digest('hex');
  return {
    block,
    reactionReminder: reactionEnabled ? REACTION_TURN_REMINDER : '',
    revision,
  };
}
