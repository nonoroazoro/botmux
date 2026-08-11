/**
 * Shared voice-config types. Kept dependency-free so both global-config.ts and
 * bot-registry.ts can import them (type-only) without a runtime import cycle
 * with the engine adapters in ./index.ts.
 */
export type VoiceEngine = 'openai';

export interface VoiceOpenAIConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

/** Stored under `voice` in ~/.botmux/config.json (global) or per bot in
 *  bots.json. A per-bot block is merged over the global one. */
export interface VoiceConfig {
  engine?: VoiceEngine;
  /** Default OpenAI-compatible voice id. */
  speaker?: string;
  /** Speech rate multiplier (1.0 = normal). */
  rate?: number;
  openai?: VoiceOpenAIConfig;
}
