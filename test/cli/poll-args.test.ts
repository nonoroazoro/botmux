import { describe, expect, it } from 'vitest';
import { parsePollCliArgs } from '../../src/cli/poll-args.js';

describe('poll CLI arguments', () => {
  it('parses repeated create options', () => {
    expect(parsePollCliArgs([
      'create',
      '--title', 'Movie night',
      '--option', 'The Odyssey (14:15)',
      '--option=Option B',
      '--chat-id', 'oc_movie',
    ])).toEqual({
      ok: true,
      value: {
        operation: 'create',
        title: 'Movie night',
        options: ['The Odyssey (14:15)', 'Option B'],
        chatId: 'oc_movie',
      },
    });
  });

  it('parses a bot vote and rejects identity flags', () => {
    expect(parsePollCliArgs(['vote', 'poll_id', '1'])).toEqual({
      ok: true,
      value: { operation: 'vote', pollId: 'poll_id', option: '1' },
    });
    expect(parsePollCliArgs(['vote', 'poll_id', '1', '--as-bot', 'cli_other'])).toMatchObject({ ok: false });
  });
});
