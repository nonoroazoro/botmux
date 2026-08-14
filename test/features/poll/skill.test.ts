import { describe, expect, it } from 'vitest';
import { BUILTIN_SKILLS } from '../../../src/skills/definitions.js';

describe('poll skill', () => {
  it('creates directly without exposing implementation details', () => {
    const skill = BUILTIN_SKILLS.find(candidate => candidate.name === 'botmux-poll');

    expect(skill?.content).toContain('run exactly one create command');
    expect(skill?.content).toContain('This is the only supported poll path');
    expect(skill?.content).toContain('new create with the same target, title, options, and description recovered from conversation context');
    expect(skill?.content).toContain('Preserve them exactly');
    expect(skill?.content).toContain('The command posts the card and is the complete response');
    expect(skill?.content).toContain('Run immediately without announcing intent or progress');
    expect(skill?.content).toContain('Do not retry or repair runtime files');
    expect(skill?.content).toContain('send no text and end with exactly `BOTMUX_NOTHING_TO_SEND`');
    expect(skill?.content).toContain('Do not read other Lark skills or docs, run help, or inspect source code, processes, sessions, or history');
    expect(skill?.content).toContain('On failure, report the exact error and stop');
    expect(skill?.content).not.toContain('native Feishu/Lark');
    expect(skill?.content).not.toContain('飞书原生投票');
    expect(skill?.content).toContain('botmux poll create');
    expect(skill?.content).toContain('botmux poll vote');
    expect(skill?.content).toContain('Per-option counts and voters stay hidden');
    expect(skill?.content).toContain('private control card');
  });
});
