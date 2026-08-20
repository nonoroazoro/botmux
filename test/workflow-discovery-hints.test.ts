import { afterEach, describe, expect, it } from 'vitest';

import {
  BOTMUX_SHELL_HINTS,
  buildBotmuxShellHints,
  buildBotmuxSystemPromptText,
} from '../src/adapters/cli/shared-hints.js';
import { config } from '../src/config.js';

/** Force the experimental anti-resend toggle (config.noVisibleOutputHint) for a
 *  test, restoring the real live getter afterwards. Mirrors how the guidance is
 *  gated in production — default OFF, opt-in via dashboard Settings. */
function setNoVisibleOutputHint(value: boolean): void {
  Object.defineProperty(config, 'noVisibleOutputHint', { get: () => value, configurable: true });
}
const restoreNoVisibleOutputHint = Object.getOwnPropertyDescriptor(config, 'noVisibleOutputHint');
afterEach(() => {
  if (restoreNoVisibleOutputHint) Object.defineProperty(config, 'noVisibleOutputHint', restoreNoVisibleOutputHint);
});

describe('always-on Workflow discovery hint', () => {
  it('uses channel-neutral routing language for private and group chats', () => {
    const zh = buildBotmuxSystemPromptText({ locale: 'zh' });
    const en = buildBotmuxSystemPromptText({ locale: 'en' });

    expect(zh).toContain('通过飞书（Lark）与用户对话');
    expect(zh).not.toContain('话题群');
    expect(zh).not.toContain('群里');
    expect(en).toContain('talking with the user through Lark');
    expect(en).not.toContain('topic group');
    expect(en).not.toContain('in the group');

    const zhShell = buildBotmuxShellHints('zh').join('\n');
    const enShell = buildBotmuxShellHints('en').join('\n');
    expect(zhShell).not.toContain('话题群');
    expect(zhShell).not.toContain('群里');
    expect(enShell).not.toContain('topic group');
    expect(enShell).not.toContain('in the group');
  });

  it('advertises bounded DAGs and reuse in zh/en shell hints', () => {
    const zh = buildBotmuxShellHints('zh').find((line) => line.startsWith('Workflow：'));
    const en = buildBotmuxShellHints('en').find((line) => line.startsWith('Workflow:'));
    expect(zh).toContain('/workflow');
    expect(zh).toContain('保存复用');
    expect(en).toContain('/workflow');
    expect(en).toContain('saved and reused');
    expect(zh!.length).toBeLessThan(100);
    expect(en!.length).toBeLessThan(140);
    expect(BOTMUX_SHELL_HINTS.some((line) => line.includes('/workflow'))).toBe(true);
  });

  it('also appears once in injectsSessionContext system routing', () => {
    const prompt = buildBotmuxSystemPromptText({ locale: 'zh' });
    expect(prompt.match(/Workflow：有界的多步目标/g)).toHaveLength(1);
    expect(prompt.indexOf('Workflow：')).toBeLessThan(prompt.indexOf('</botmux_routing>'));
  });
});

describe('message transport guidance', () => {
  it('does not prescribe plans or progress updates as messages', () => {
    const prompts = [
      buildBotmuxShellHints('zh').join('\n'),
      buildBotmuxSystemPromptText({ locale: 'zh' }),
      buildBotmuxShellHints('en').join('\n'),
      buildBotmuxSystemPromptText({ locale: 'en' }),
    ];

    for (const prompt of prompts) {
      expect(prompt).not.toContain('关键结论、方案');
      expect(prompt).not.toContain('进度更新');
      expect(prompt).not.toContain('plans (wait for user approval before acting)');
      expect(prompt).not.toContain('progress updates');
    }

    expect(prompts[0]).toContain('当你已经决定要向用户发送消息时');
    expect(prompts[2]).toContain('When you have decided to send a message to the user');
  });
});

describe('repository checkout guidance', () => {
  it('requires every CLI path to sync local default-branch checkouts before code work', () => {
    const prompts = [
      buildBotmuxShellHints('zh').join('\n'),
      buildBotmuxSystemPromptText({ locale: 'zh' }),
      buildBotmuxShellHints('en').join('\n'),
      buildBotmuxSystemPromptText({ locale: 'en' }),
      BOTMUX_SHELL_HINTS.join('\n'),
    ];

    for (const prompt of prompts) {
      expect(prompt).toContain('Clone missing repos unless the user opts out');
      expect(prompt).toContain('switch to the remote default branch');
      expect(prompt).toContain('fast-forward unless the user asks to continue current work');
      expect(prompt).toContain('Never reset, stash, overwrite, or discard user work');
      expect(prompt).toContain('ask the user to log in');
      expect(prompt).toContain('Inspect the synced working tree only');
      expect(prompt).toContain('never remote code search or view');
      expect(prompt).toContain('`git show` remote paths');
      expect(prompt).toContain('merge requests');
    }
  });
});

describe('anti-resend guidance (thinking-only nudge false-alarm) — experimental, gated on config.noVisibleOutputHint', () => {
  it('is ABSENT by default (toggle OFF) — hints match the pre-feature baseline', () => {
    setNoVisibleOutputHint(false);
    expect(buildBotmuxShellHints('zh').some((l) => l.includes('无可见输出') || l.includes('不要重发'))).toBe(false);
    expect(buildBotmuxShellHints('en').some((l) => l.toLowerCase().includes('no visible output'))).toBe(false);
    expect(buildBotmuxSystemPromptText({ locale: 'zh' })).not.toContain('不要因此重发');
    expect(buildBotmuxSystemPromptText({ locale: 'en' }).toLowerCase()).not.toContain('do not resend');
    // The deprecated static array never carries it regardless of the toggle
    // (it must not read runtime config at module load).
    expect(BOTMUX_SHELL_HINTS.some((l) => l.includes('不要重发') || l.toLowerCase().includes('do not resend'))).toBe(false);
  });

  it('is present in zh/en shell hints when the toggle is ON', () => {
    setNoVisibleOutputHint(true);
    expect(buildBotmuxShellHints('zh').some((l) => l.includes('无可见输出') || l.includes('不要重发'))).toBe(true);
    expect(buildBotmuxShellHints('en').some((l) => l.toLowerCase().includes('no visible output') && l.toLowerCase().includes('do not resend'))).toBe(true);
  });

  it('is present in injectsSessionContext system routing (zh/en), inside the routing block, when ON', () => {
    setNoVisibleOutputHint(true);
    const zh = buildBotmuxSystemPromptText({ locale: 'zh' });
    const en = buildBotmuxSystemPromptText({ locale: 'en' });
    expect(zh).toContain('不要因此重发');
    expect(en.toLowerCase()).toContain('do not resend');
    // Must live inside <botmux_routing>…</botmux_routing>, not leak after it.
    expect(zh.indexOf('不要因此重发')).toBeLessThan(zh.indexOf('</botmux_routing>'));
    expect(en.toLowerCase().indexOf('do not resend')).toBeLessThan(en.indexOf('</botmux_routing>'));
  });
});
