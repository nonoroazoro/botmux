import { resetMemoryFs } from '../../helpers/memory-fs/index.js';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async () => (await import('../../helpers/memory-fs/index.js')).fs);
vi.mock('node:fs/promises', async () => (await import('../../helpers/memory-fs/index.js')).fs.promises);

// Reset the in-memory fixture tree between cases; no host directories are created.
beforeEach(() => {
  resetMemoryFs({
    '/fixtures/botmux-poll-card-handler-1': null,
  });
});
import {
  attachPollMessage,
  createPoll,
  getPoll,
  handlePollCardAction,
} from '../../../src/features/poll/index.js';

vi.mock('../../../src/im/lark/client.js', () => ({
  deleteMessage: vi.fn(),
  sendMessage: vi.fn(),
  sendUserMessage: vi.fn(),
  updateMessage: vi.fn(),
}));

describe('poll card handler', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = '/fixtures/botmux-poll-card-handler-1';
    process.env.SESSION_DATA_DIR = dataDir;
  });

  afterEach(() => {
    delete process.env.SESSION_DATA_DIR;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('records a human vote and returns the refreshed localized card', async () => {
    const poll = createPoll({
      ownerLarkAppId: 'cli_owner',
      creatorOpenId: 'ou_creator',
      chatId: 'oc_movie',
      title: '今天看什么？',
      options: ['奥德赛', '沙丘 3'],
    });
    attachPollMessage(poll.id, 'om_poll');

    const result = await handlePollCardAction({
      operator: { open_id: 'ou_user' },
      context: { open_message_id: 'om_poll' },
      action: {
        value: {
          action: 'poll_vote',
          poll_id: poll.id,
          option_id: 'opt_1',
        },
      },
    }, 'cli_owner');

    expect(result).toMatchObject({
      toast: { type: 'success', content: '投票成功' },
      card: { type: 'raw', data: { schema: '2.0' } },
    });
    expect(JSON.stringify(result)).not.toContain('<at id=ou_user></at>');
    expect(JSON.stringify(result)).toContain('参与人数');
    expect(JSON.stringify(result)).not.toContain('1 票');
    expect(getPoll(poll.id)?.votes['human:ou_user']).toMatchObject({
      kind: 'human',
      optionId: 'opt_1',
      openId: 'ou_user',
    });

    const repeated = await handlePollCardAction({
      operator: { open_id: 'ou_user' },
      context: { open_message_id: 'om_poll' },
      action: {
        value: {
          action: 'poll_vote',
          poll_id: poll.id,
          option_id: 'opt_2',
        },
      },
    }, 'cli_owner');
    expect(repeated).toEqual({ toast: { type: 'error', content: '你已经投过票，不能修改' } });
  });

  it('only lets the creator end the poll and publishes final results', async () => {
    const poll = createPoll({
      ownerLarkAppId: 'cli_owner',
      creatorOpenId: 'ou_creator',
      chatId: 'oc_movie',
      title: '今天看什么？',
      options: ['奥德赛', '沙丘 3'],
    });
    attachPollMessage(poll.id, 'om_poll');

    const denied = await handlePollCardAction({
      operator: { open_id: 'ou_other' },
      action: { value: { action: 'poll_close', poll_id: poll.id } },
    }, 'cli_owner');
    const closed = await handlePollCardAction({
      operator: { open_id: 'ou_creator' },
      action: { value: { action: 'poll_close', poll_id: poll.id } },
    }, 'cli_owner');

    expect(denied).toEqual({ toast: { type: 'error', content: '只有投票发起人可以结束投票' } });
    expect(closed).toMatchObject({
      toast: { type: 'success', content: '投票已结束，最终结果已公布' },
      card: { type: 'raw', data: { schema: '2.0' } },
    });
    expect(JSON.stringify(closed)).not.toContain('poll_close');
    expect(getPoll(poll.id)?.closedAt).toEqual(expect.any(Number));
  });
});
