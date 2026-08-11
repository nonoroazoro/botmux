/**
 * Voice config gating + audio helpers (pure logic).
 * Run: pnpm vitest run test/voice-config.test.ts
 */
import { describe, it, expect } from 'vitest';
import { evaluateVoiceConfig, DEFAULT_OPENAI_SPEAKER } from '../src/services/voice/index.js';
import { toSpoken, pcmDurationMs, pcmToWav } from '../src/services/voice/audio.js';

describe('evaluateVoiceConfig — button gating', () => {
  it('returns null when nothing configured', () => {
    expect(evaluateVoiceConfig(undefined, undefined)).toBeNull();
    expect(evaluateVoiceConfig({}, {})).toBeNull();
  });

  it('OpenAI needs baseUrl + model', () => {
    expect(evaluateVoiceConfig({ engine: 'openai', openai: { baseUrl: 'http://x/v1' } }, undefined)).toBeNull();
    const ok = evaluateVoiceConfig({ engine: 'openai', openai: { baseUrl: 'http://x/v1', model: 'tts-1' } }, undefined);
    expect(ok?.engine).toBe('openai');
  });

  it('infers engine from creds when engine omitted', () => {
    const v = evaluateVoiceConfig({ openai: { baseUrl: 'http://x/v1', model: 'tts-1' } }, undefined);
    expect(v?.engine).toBe('openai');
  });

  it('per-bot overrides global field-by-field', () => {
    const global = { engine: 'openai' as const, speaker: 'global_voice', openai: { baseUrl: 'http://x/v1', model: 'tts-1' } };
    const perBot = { speaker: 'bot_voice' };
    const v = evaluateVoiceConfig(global, perBot);
    expect(v?.engine).toBe('openai');         // inherited from global
    expect(v?.speaker).toBe('bot_voice');     // overridden by per-bot
    expect(v?.openai?.model).toBe('tts-1');    // config inherited
  });
});

describe('audio helpers', () => {
  it('toSpoken strips code, urls, markdown', () => {
    const s = toSpoken('# 标题\n看 `foo()` 和 ```js\nbar()\n``` 还有 https://x.com 链接 **粗体**');
    expect(s).not.toContain('```');
    expect(s).not.toContain('http');
    expect(s).not.toContain('#');
    expect(s).not.toContain('**');
    expect(s).toContain('粗体');
  });

  it('pcmDurationMs: 1s of 24kHz mono s16le = ~1000ms', () => {
    const oneSec: Buffer = Buffer.alloc(24000 * 2); // 24000 frames * 2 bytes
    expect(pcmDurationMs({ data: oneSec, sampleRate: 24000, channels: 1 })).toBe(1000);
  });

  it('pcmToWav writes a 44-byte RIFF/WAVE header with correct rate', () => {
    const pcm = Buffer.alloc(100);
    const wav = pcmToWav({ data: pcm, sampleRate: 24000, channels: 1 });
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(wav.subarray(8, 12).toString()).toBe('WAVE');
    expect(wav.readUInt32LE(24)).toBe(24000); // sample rate
    expect(wav.readUInt16LE(22)).toBe(1);     // channels
    expect(wav.length).toBe(44 + 100);
  });

  it('uses the neutral OpenAI-compatible default speaker', () => {
    expect(DEFAULT_OPENAI_SPEAKER).toBe('alloy');
  });
});
