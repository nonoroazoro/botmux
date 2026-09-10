import { createHash } from 'node:crypto';
import type { BotConfig } from '../bot-registry.js';
import {
  effectiveDefaultWorkingDir,
  parseBotConfigsFromText,
} from '../bot-registry.js';
import { createCliAdapterSync } from '../adapters/cli/registry.js';
import { config } from '../config.js';
import { resolvePairedSpawnBackendType } from '../core/persistent-backend.js';
import { canonicalJson } from '../utils/canonical-input-hash.js';
import { rmwBotEntry } from './config-store.js';
import { evaluateVcMeetingConsumerIsolation } from './vc-meeting-consumer-isolation.js';

export interface VcMeetingConsumerBootstrapAgent {
  appId: string;
  workingDirReady: boolean;
  reliableTurnTerminal: boolean;
  managedSideEffectIsolation: boolean;
}

export interface VcMeetingConsumerBootstrapAgentDeps {
  workingDirReady(bot: BotConfig): boolean;
  reliableTurnTerminal(bot: BotConfig): boolean;
  managedSideEffectIsolation(bot: BotConfig): boolean;
}

const defaultAgentDeps: VcMeetingConsumerBootstrapAgentDeps = {
  workingDirReady(bot) {
    try {
      return !!(effectiveDefaultWorkingDir(bot) ?? bot.workingDir);
    } catch {
      return false;
    }
  },
  reliableTurnTerminal(bot) {
    if (!bot.cliId) return false;
    try {
      return createCliAdapterSync(bot.cliId, bot.cliPathOverride).reliableTurnTerminal === true;
    } catch {
      return false;
    }
  },
  managedSideEffectIsolation(bot) {
    const cliId = bot.cliId ?? config.daemon.cliId;
    const backendType = resolvePairedSpawnBackendType(
      cliId,
      undefined,
      bot.backendType,
      config.daemon.backendType,
    );
    return evaluateVcMeetingConsumerIsolation({
      sandbox: bot.sandbox,
      platform: process.platform,
      backendType,
    }).ok;
  },
};

export function buildVcMeetingConsumerBootstrapAgents(
  configs: readonly BotConfig[],
  deps: VcMeetingConsumerBootstrapAgentDeps = defaultAgentDeps,
): VcMeetingConsumerBootstrapAgent[] {
  return configs.map(bot => ({
    appId: bot.larkAppId,
    workingDirReady: deps.workingDirReady(bot),
    reliableTurnTerminal: deps.reliableTurnTerminal(bot),
    managedSideEffectIsolation: deps.managedSideEffectIsolation(bot),
  })).sort((a, b) => (a.appId === b.appId ? 0 : a.appId < b.appId ? -1 : 1));
}

/**
 * Choose a durable receiver identity. Explicit preferences win. Otherwise
 * prefer the event receiver itself, then another eligible agent. Online state
 * is deliberately absent because it is transient.
 */
export function selectVcMeetingDefaultConsumerAgent(
  listenerBotAppId: string,
  agents: readonly VcMeetingConsumerBootstrapAgent[],
  preferredAgentAppIds: readonly string[] = [],
): VcMeetingConsumerBootstrapAgent | undefined {
  const eligible = agents
    .filter(agent => agent.workingDirReady
      && agent.reliableTurnTerminal
      && agent.managedSideEffectIsolation)
    .sort((a, b) => (a.appId === b.appId ? 0 : a.appId < b.appId ? -1 : 1));
  for (const appId of preferredAgentAppIds) {
    const preferred = eligible.find(agent => agent.appId === appId);
    if (preferred) return preferred;
  }
  return eligible.find(agent => agent.appId === listenerBotAppId)
    ?? eligible.find(agent => agent.appId !== listenerBotAppId);
}

const LEGACY_VC_CONSUMER_AGENT_FIELDS = [
  'defaultAgentAppId',
  'defaultAgent',
  'agentCandidates',
  'agents',
] as const;

const DEFAULT_CONSUMER_PROFILE_GENERATOR_VERSION = 2;
const DEFAULT_CONSUMER_PROFILE_ID = 'minutes';
const DEFAULT_CONSUMER_PROFILE_LABEL = '会议纪要';
export const DEFAULT_CONSUMER_PROFILE_INSTRUCTIONS = 'Maintain current meeting minutes with confirmed decisions, action items with owners and deadlines, and unresolved risks. Apply transcript corrections to existing entries instead of creating duplicates. Post a concise update to the meeting chat only when there is a new key decision, explicit action, material risk, or direct request. Otherwise remain silent. Use the meeting reply controls for any in-meeting text or voice, and follow the configured permission and approval rules.';

export interface VcMeetingDefaultConsumerProfileOwnedConfig {
  defaultMode: unknown;
  defaultConsumerIds: unknown;
  profile: unknown;
}

/** Hash exactly the fields owned by the default-profile generator. */
export function computeVcMeetingDefaultConsumerProfileConfigHash(
  input: VcMeetingDefaultConsumerProfileOwnedConfig,
): string {
  const canonicalOwnedConfig = canonicalJson({
    defaultMode: input.defaultMode,
    defaultConsumerIds: input.defaultConsumerIds,
    profile: input.profile,
  });
  return `sha256:${createHash('sha256').update(canonicalOwnedConfig, 'utf8').digest('hex')}`;
}

/**
 * Verify that the current bootstrap marker still fingerprints the generated
 * defaults. Non-generator fields such as enabled/injectIntervalMs are excluded.
 */
export function isVcMeetingDefaultConsumerProfileBootstrapIntact(
  meetingConsumer: {
    defaultMode?: unknown;
    defaultConsumerIds?: unknown;
    consumerProfiles?: unknown;
    defaultProfileBootstrap?: unknown;
  },
): boolean {
  return vcMeetingDefaultConsumerBootstrapProfileForVersion(
    meetingConsumer,
    DEFAULT_CONSUMER_PROFILE_GENERATOR_VERSION,
  ) !== undefined;
}

function vcMeetingDefaultConsumerBootstrapProfileForVersion(
  meetingConsumer: {
    defaultMode?: unknown;
    defaultConsumerIds?: unknown;
    consumerProfiles?: unknown;
    defaultProfileBootstrap?: unknown;
  },
  generatorVersion: number,
): Record<string, unknown> | undefined {
  const marker = meetingConsumer.defaultProfileBootstrap;
  if (!marker || typeof marker !== 'object' || Array.isArray(marker)) return undefined;
  const markerEntry = marker as Record<string, unknown>;
  if (markerEntry.generatorVersion !== generatorVersion
    || typeof markerEntry.profileId !== 'string'
    || typeof markerEntry.configHash !== 'string') return undefined;
  if (!Array.isArray(meetingConsumer.consumerProfiles)) return undefined;
  const matchingProfiles = meetingConsumer.consumerProfiles.filter(profile =>
    !!profile
    && typeof profile === 'object'
    && !Array.isArray(profile)
    && (profile as Record<string, unknown>).id === markerEntry.profileId);
  if (matchingProfiles.length !== 1) return undefined;
  try {
    return markerEntry.configHash === computeVcMeetingDefaultConsumerProfileConfigHash({
      defaultMode: meetingConsumer.defaultMode,
      defaultConsumerIds: meetingConsumer.defaultConsumerIds,
      profile: matchingProfiles[0],
    })
      ? matchingProfiles[0] as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function createVcMeetingDefaultConsumerProfile(agentAppId: string): Record<string, unknown> {
  return {
    id: DEFAULT_CONSUMER_PROFILE_ID,
    agentAppId,
    label: DEFAULT_CONSUMER_PROFILE_LABEL,
    role: 'minutes',
    instructions: DEFAULT_CONSUMER_PROFILE_INSTRUCTIONS,
    responseMode: 'listener_thread',
    capabilities: [
      'listener.output.request',
      'meeting.output.request',
      'meeting.read',
    ],
    ownedSinks: ['meeting_text', 'meeting_voice'],
  };
}

/**
 * Mutate one latest raw meetingConsumer object only when no profile or agent
 * policy has ever been initialized. Own-property checks are intentional:
 * `consumerProfiles: []` is an explicit opt-out and must never be resurrected.
 */
export function seedVcMeetingDefaultConsumerProfile(
  meetingConsumer: Record<string, unknown>,
  listenerBotAppId: string,
  agents: readonly VcMeetingConsumerBootstrapAgent[],
): boolean {
  if (Object.prototype.hasOwnProperty.call(meetingConsumer, 'consumerProfiles')) return false;
  if (Object.prototype.hasOwnProperty.call(meetingConsumer, 'defaultConsumerIds')) return false;
  if (LEGACY_VC_CONSUMER_AGENT_FIELDS.some(field =>
    Object.prototype.hasOwnProperty.call(meetingConsumer, field))) return false;
  // Any explicitly persisted mode is operator-owned state. In particular,
  // `defaultMode: listenOnly` must not be mistaken for a fresh install and
  // silently changed to agents on upgrade.
  if (Object.prototype.hasOwnProperty.call(meetingConsumer, 'defaultMode')) return false;

  const agent = selectVcMeetingDefaultConsumerAgent(listenerBotAppId, agents);
  if (!agent) return false;

  const profile = createVcMeetingDefaultConsumerProfile(agent.appId);
  const defaultConsumerIds = [DEFAULT_CONSUMER_PROFILE_ID];
  meetingConsumer.consumerProfiles = [profile];
  meetingConsumer.defaultMode = 'agents';
  meetingConsumer.defaultConsumerIds = defaultConsumerIds;
  meetingConsumer.defaultProfileBootstrap = {
    generatorVersion: DEFAULT_CONSUMER_PROFILE_GENERATOR_VERSION,
    profileId: DEFAULT_CONSUMER_PROFILE_ID,
    configHash: computeVcMeetingDefaultConsumerProfileConfigHash({
      defaultMode: 'agents',
      defaultConsumerIds,
      profile,
    }),
  };
  return true;
}

export type BootstrapVcMeetingDefaultConsumerProfileResult =
  | { ok: true; seeded: true; agentAppId: string }
  | { ok: true; seeded: false; reason: 'disabled' | 'already_initialized' | 'legacy_config' | 'no_eligible_agent' }
  | { ok: false; reason: 'bot_not_in_config' | 'config_unavailable' | 'validation_failed'; error?: string };

/**
 * Lock-protected, idempotent one-time materialization used after daemon config
 * load. The latest file is parsed again under the lock, so concurrent daemon
 * starts and Dashboard saves cannot overwrite or resurrect an explicit empty
 * catalog.
 */
export async function bootstrapVcMeetingDefaultConsumerProfile(
  listenerBotAppId: string,
  deps: VcMeetingConsumerBootstrapAgentDeps = defaultAgentDeps,
): Promise<BootstrapVcMeetingDefaultConsumerProfileResult> {
  try {
    const result = await rmwBotEntry<BootstrapVcMeetingDefaultConsumerProfileResult>(
      listenerBotAppId,
      (entry, raw) => {
        let configs: BotConfig[];
        try {
          configs = parseBotConfigsFromText(JSON.stringify(raw));
        } catch (err) {
          return {
            write: false,
            result: {
              ok: false,
              reason: 'validation_failed',
              error: err instanceof Error ? err.message : String(err),
            } as const,
          };
        }
        const bot = configs.find(config => config.larkAppId === listenerBotAppId);
        if (!bot) {
          return { write: false, result: { ok: false, reason: 'bot_not_in_config' } as const };
        }
        const rawEntry = entry && typeof entry === 'object' && !Array.isArray(entry)
          ? entry as Record<string, unknown>
          : {};
        const vcAgent = rawEntry.vcMeetingAgent && typeof rawEntry.vcMeetingAgent === 'object'
          && !Array.isArray(rawEntry.vcMeetingAgent)
          ? rawEntry.vcMeetingAgent as Record<string, unknown>
          : undefined;
        const consumer = vcAgent?.meetingConsumer && typeof vcAgent.meetingConsumer === 'object'
          && !Array.isArray(vcAgent.meetingConsumer)
          ? vcAgent.meetingConsumer as Record<string, unknown>
          : undefined;
        if (vcAgent?.enabled !== true || consumer?.enabled !== true) {
          return { write: false, result: { ok: true, seeded: false, reason: 'disabled' } as const };
        }
        const hadConsumerProfiles = Object.prototype.hasOwnProperty.call(consumer, 'consumerProfiles');
        const hasLegacy = LEGACY_VC_CONSUMER_AGENT_FIELDS.some(field =>
          Object.prototype.hasOwnProperty.call(consumer, field))
          || consumer.defaultMode === 'agent';
        if (!seedVcMeetingDefaultConsumerProfile(
          consumer,
          listenerBotAppId,
          buildVcMeetingConsumerBootstrapAgents(configs, deps),
        )) {
          if (hadConsumerProfiles) {
            return { write: false, result: { ok: true, seeded: false, reason: 'already_initialized' } as const };
          }
          if (hasLegacy
            || Object.prototype.hasOwnProperty.call(consumer, 'defaultConsumerIds')
            || Object.prototype.hasOwnProperty.call(consumer, 'defaultMode')) {
            return { write: false, result: { ok: true, seeded: false, reason: 'legacy_config' } as const };
          }
          return { write: false, result: { ok: true, seeded: false, reason: 'no_eligible_agent' } as const };
        }
        try {
          // Validate the complete latest file, not only the generated fragment.
          parseBotConfigsFromText(JSON.stringify(raw));
        } catch (err) {
          return {
            write: false,
            result: {
              ok: false,
              reason: 'validation_failed',
              error: err instanceof Error ? err.message : String(err),
            } as const,
          };
        }
        const profile = (consumer.consumerProfiles as Array<{ agentAppId: string }>)[0]!;
        return {
          write: true,
          result: { ok: true, seeded: true, agentAppId: profile.agentAppId } as const,
        };
      },
    );
    return result.ok ? result.result : { ok: false, reason: 'bot_not_in_config' };
  } catch (err) {
    return {
      ok: false,
      reason: 'config_unavailable',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
