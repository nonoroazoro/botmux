import { resetMemoryFs } from '../../helpers/memory-fs/index.js';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async () => (await import('../../helpers/memory-fs/index.js')).fs);
vi.mock('node:fs/promises', async () => (await import('../../helpers/memory-fs/index.js')).fs.promises);

// Reset the in-memory fixture tree between cases; no host directories are created.
beforeEach(() => {
  resetMemoryFs({
    '/fixtures/botmux-poll-store-1': null,
  });
});
import {
  attachPollMessage,
  castPollVote,
  closePoll,
  createPoll,
  getPoll,
} from '../../../src/features/poll/index.js';

describe('poll store', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = '/fixtures/botmux-poll-store-1';
    process.env.SESSION_DATA_DIR = dataDir;
  });

  afterEach(() => {
    delete process.env.SESSION_DATA_DIR;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('records one vote per identity and rejects changes', () => {
    const created = createPoll({
      ownerLarkAppId: 'cli_owner',
      creatorOpenId: 'ou_creator',
      chatId: 'oc_movie',
      title: 'Movie night',
      options: ['The Odyssey (14:15)', 'Option B'],
    }, 100);
    attachPollMessage(created.id, 'om_poll', 101);

    expect(created.locale).toBe('en');

    const first = castPollVote({
      pollId: created.id,
      optionId: 'opt_1',
      voterKey: 'bot:cli_voter',
      kind: 'bot',
      displayName: 'Reviewer',
      now: 102,
    });
    const repeated = castPollVote({
      pollId: created.id,
      optionId: 'opt_2',
      voterKey: 'bot:cli_voter',
      kind: 'bot',
      displayName: 'Reviewer',
      now: 103,
    });

    expect(first).toMatchObject({ ok: true });
    expect(repeated).toEqual({ ok: false, error: 'already_voted' });
    expect(getPoll(created.id)?.votes['bot:cli_voter']).toMatchObject({
      kind: 'bot',
      optionId: 'opt_1',
      displayName: 'Reviewer',
    });
  });

  it('rejects invalid poll shapes', () => {
    expect(() => createPoll({
      ownerLarkAppId: 'cli_owner',
      creatorOpenId: 'ou_creator',
      chatId: 'oc_movie',
      title: 'Movie night',
      options: ['Same', 'Same'],
    })).toThrow('duplicate_options');
  });

  it('detects Chinese poll content at creation time', () => {
    const poll = createPoll({
      ownerLarkAppId: 'cli_owner',
      creatorOpenId: 'ou_creator',
      chatId: 'oc_movie',
      title: '今天看什么？',
      options: ['奥德赛', '沙丘 3'],
    });

    expect(poll.locale).toBe('zh');
  });

  it('only lets the creator close the poll and rejects later votes', () => {
    const poll = createPoll({
      ownerLarkAppId: 'cli_owner',
      creatorOpenId: 'ou_creator',
      chatId: 'oc_movie',
      title: 'Movie night',
      options: ['A', 'B'],
    }, 100);

    expect(closePoll(poll.id, 'ou_other', 101)).toEqual({ ok: false, error: 'not_creator' });
    expect(closePoll(poll.id, 'ou_creator', 102)).toMatchObject({ ok: true, changed: true });
    expect(castPollVote({
      pollId: poll.id,
      optionId: 'opt_1',
      voterKey: 'human:ou_user',
      kind: 'human',
      openId: 'ou_user',
    })).toEqual({ ok: false, error: 'poll_closed' });
  });
});
