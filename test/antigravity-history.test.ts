import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { resetMemoryFs } from './helpers/memory-fs/index.js';
import { createAntigravityAdapter } from '../src/adapters/cli/antigravity.js';

vi.mock('node:fs', async () => (await import('./helpers/memory-fs/index.js')).fs);

const historyPath = join(homedir(), '.gemini', 'antigravity-cli', 'history.jsonl');

beforeEach(() => {
  resetMemoryFs({ [historyPath]: '{"display":"earlier"}\n' });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('antigravity submit verification', () => {
  it.each([
    ['line1\nline2', String.raw`{"display":"line1\nline2"}`],
    ['<user_message>\n你好&', String.raw`{"display":"\u003cuser_message\u003e\n你好\u0026"}`],
    ['a'.repeat(80), `{"display":"${'a'.repeat(40)}"}`],
  ])('confirms a newly appended CLI history entry for %s', async (content, historyLine) => {
    const sendText = vi.fn();
    const sendSpecialKeys = vi.fn((key: string) => {
      if (key === 'Enter') appendFileSync(historyPath, historyLine + '\n');
    });
    const result = createAntigravityAdapter().writeInput({ write: vi.fn(), sendText, sendSpecialKeys }, content);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(await result).toBeUndefined();
    expect(sendText.mock.calls.map(([text]) => text)).toEqual(content.split('\n'));
    expect(sendSpecialKeys.mock.calls.filter(([key]) => key === 'Enter')).toHaveLength(1);
    expect(sendSpecialKeys.mock.calls.filter(([key]) => key === 'M-Enter'))
      .toHaveLength(content.split('\n').length - 1);
  });

  it('ignores preexisting matching history and unrelated appends, then rechecks a late submission', async () => {
    appendFileSync(historyPath, '{"display":"alpha"}\n');
    const sendSpecialKeys = vi.fn((key: string) => {
      if (key === 'Enter') appendFileSync(historyPath, '{"display":"someone-else"}\n');
    });
    const result = createAntigravityAdapter().writeInput({ write: vi.fn(), sendText: vi.fn(), sendSpecialKeys }, 'alpha');
    await vi.advanceTimersByTimeAsync(4_000);
    const verification = await result;
    expect(verification?.submitted).toBe(false);
    expect(verification?.recheck?.()).toBe(false);
    appendFileSync(historyPath, '{"display":"alpha"}\n');
    expect(verification?.recheck?.()).toBe(true);
  });
});

describe('antigravity adapter — high-level invariants', () => {
  it('id property is stable', () => {
    const a = createAntigravityAdapter('/usr/local/bin/agy');
    expect(a.id).toBe('antigravity');
  });

  it('declares altScreen so xterm renderer takes its TUI snapshot path', () => {
    const a = createAntigravityAdapter('/usr/local/bin/agy');
    expect(a.altScreen).toBe(true);
  });

  it('omits readyPattern/completionPattern (uses idle-detector quiescence)', () => {
    const a = createAntigravityAdapter('/usr/local/bin/agy');
    expect(a.readyPattern).toBeUndefined();
    expect(a.completionPattern).toBeUndefined();
  });

  it('exposes systemHints (BOTMUX_SHELL_HINTS) for /botmux-* skill routing', () => {
    const a = createAntigravityAdapter('/usr/local/bin/agy');
    // BOTMUX_SHELL_HINTS is a non-empty array of routing hint lines.
    expect(Array.isArray(a.systemHints)).toBe(true);
    expect(a.systemHints!.length).toBeGreaterThan(0);
  });
});
