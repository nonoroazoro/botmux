import { afterEach, describe, expect, it } from 'vitest';

import {
  BOTMUX_SHELL_HINTS,
  buildBotmuxShellHints,
  buildBotmuxSystemPromptText,
} from '../src/adapters/cli/shared-hints.js';
import { config } from '../src/config.js';

/**
 * Force the experimental anti-resend toggle for one test, then restore the
 * production getter. The guidance is disabled by default.
 */
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

    expect(zh).toContain('responding through Lark');
    expect(zh).not.toContain('topic group');
    expect(zh).not.toContain('in the group');
    expect(en).toContain('responding through Lark');
    expect(en).not.toContain('topic group');
    expect(en).not.toContain('in the group');

    const zhShell = buildBotmuxShellHints('zh').join('\n');
    const enShell = buildBotmuxShellHints('en').join('\n');
    expect(zhShell).not.toContain('topic group');
    expect(zhShell).not.toContain('in the group');
    expect(enShell).not.toContain('topic group');
    expect(enShell).not.toContain('in the group');
  });

  it('advertises bounded DAGs and reuse regardless of UI locale', () => {
    const zh = buildBotmuxShellHints('zh').find((line) => line.startsWith('For a bounded multi-step goal'));
    const en = buildBotmuxShellHints('en').find((line) => line.startsWith('For a bounded multi-step goal'));
    expect(zh).toBeDefined();
    expect(en).toBeDefined();
    expect(zh ?? '').toContain('/workflow');
    expect(zh ?? '').toContain('saved and reused');
    expect(en).toContain('/workflow');
    expect(en).toContain('saved and reused');
    expect((zh ?? '').length).toBeLessThan(160);
    expect((en ?? '').length).toBeLessThan(160);
    expect(BOTMUX_SHELL_HINTS.some((line) => line.includes('/workflow'))).toBe(true);
  });

  it('also appears once in injectsSessionContext system routing', () => {
    const prompt = buildBotmuxSystemPromptText({ locale: 'zh' });
    expect(prompt.match(/For a bounded multi-step goal/g)).toHaveLength(1);
    expect(prompt.indexOf('For a bounded multi-step goal')).toBeLessThan(prompt.indexOf('</botmux_routing>'));
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
      expect(prompt).not.toContain('plans (wait for user approval before acting)');
      expect(prompt).not.toContain('progress updates');
    }

    expect(prompts[0]).toContain('Send user-visible replies');
    expect(prompts[2]).toContain('Send user-visible replies');
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
      expect(prompt).toContain('Clone missing repositories unless the user opts out');
      expect(prompt).toContain('switch to the remote default branch');
      expect(prompt).toContain('fast-forward unless the user requests another branch, revision, or current worktree');
      expect(prompt).toContain('Never reset, stash, overwrite, or discard user work');
      expect(prompt).toContain('request login only when authentication blocks progress');
      expect(prompt).toContain('Inspect only local checkouts');
      expect(prompt).toContain('never for remote code search or inspection');
      expect(prompt).toContain('merge requests');
    }
  });
});

describe('anti-resend guidance (thinking-only nudge false-alarm) — experimental, gated on config.noVisibleOutputHint', () => {
  it('is absent by default', () => {
    setNoVisibleOutputHint(false);
    expect(buildBotmuxShellHints('zh').some((l) => l.toLowerCase().includes('no visible output'))).toBe(false);
    expect(buildBotmuxShellHints('en').some((l) => l.toLowerCase().includes('no visible output'))).toBe(false);
    expect(buildBotmuxSystemPromptText({ locale: 'zh' }).toLowerCase()).not.toContain('do not resend');
    expect(buildBotmuxSystemPromptText({ locale: 'en' }).toLowerCase()).not.toContain('do not resend');
    // The static array must not read runtime config at module load.
    expect(BOTMUX_SHELL_HINTS.some((l) => l.toLowerCase().includes('do not resend'))).toBe(false);
  });

  it('is present in zh/en shell hints when the toggle is ON', () => {
    setNoVisibleOutputHint(true);
    expect(buildBotmuxShellHints('zh').some((l) => l.toLowerCase().includes('no visible output') && l.toLowerCase().includes('do not resend'))).toBe(true);
    expect(buildBotmuxShellHints('en').some((l) => l.toLowerCase().includes('no visible output') && l.toLowerCase().includes('do not resend'))).toBe(true);
  });

  it('is present in injectsSessionContext system routing (zh/en), inside the routing block, when ON', () => {
    setNoVisibleOutputHint(true);
    const zh = buildBotmuxSystemPromptText({ locale: 'zh' });
    const en = buildBotmuxSystemPromptText({ locale: 'en' });
    expect(zh.toLowerCase()).toContain('do not resend');
    expect(en.toLowerCase()).toContain('do not resend');
    // The instruction must stay inside the routing block.
    expect(zh.toLowerCase().indexOf('do not resend')).toBeLessThan(zh.indexOf('</botmux_routing>'));
    expect(en.toLowerCase().indexOf('do not resend')).toBeLessThan(en.indexOf('</botmux_routing>'));
  });
});
