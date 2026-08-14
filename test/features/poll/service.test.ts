import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachPollMessage,
  castBotPollVote,
  castHumanPollVote,
  createAndPublishPoll,
  createPoll,
  getPoll,
} from '../../../src/features/poll/index.js';

const lark = vi.hoisted(() => ({
  deleteMessage: vi.fn(),
  sendMessage: vi.fn(),
  sendUserMessage: vi.fn(),
  updateMessage: vi.fn(),
}));

vi.mock('../../../src/im/lark/client.js', () => lark);

describe('poll service', () => {
  let dataDir: string;
  let pollId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    lark.deleteMessage.mockResolvedValue(true);
    dataDir = mkdtempSync(join(tmpdir(), 'botmux-poll-service-'));
    process.env.SESSION_DATA_DIR = dataDir;
    const poll = createPoll({
      ownerLarkAppId: 'cli_owner',
      creatorOpenId: 'ou_creator',
      chatId: 'oc_movie',
      title: 'Movie night',
      options: ['The Odyssey (14:15)', 'Option B'],
    });
    pollId = poll.id;
    attachPollMessage(pollId, 'om_poll');
  });

  it('publishes the creator control before a poll in the current direct chat', async () => {
    lark.sendMessage
      .mockResolvedValueOnce('om_control')
      .mockResolvedValueOnce('om_public');

    const poll = await createAndPublishPoll({
      ownerLarkAppId: 'cli_owner',
      creatorOpenId: 'ou_creator',
      chatId: 'oc_direct',
      title: 'Movie night',
      options: ['A', 'B'],
    }, 'oc_direct');

    expect(lark.sendMessage).toHaveBeenCalledTimes(2);
    expect(lark.sendMessage.mock.calls[0]?.[1]).toBe('oc_direct');
    expect(lark.sendMessage.mock.calls[0]?.[2]).toContain('poll_close');
    expect(lark.sendMessage.mock.calls[1]?.[1]).toBe('oc_direct');
    expect(lark.sendMessage.mock.calls[1]?.[2]).toContain('poll_vote');
    expect(lark.sendUserMessage).not.toHaveBeenCalled();
    expect(poll.messageId).toBe('om_public');
  });

  it('removes the private control and poll record when public delivery fails', async () => {
    lark.sendMessage
      .mockResolvedValueOnce('om_control')
      .mockRejectedValueOnce(new Error('public_failed'));

    await expect(createAndPublishPoll({
      ownerLarkAppId: 'cli_owner',
      creatorOpenId: 'ou_creator',
      chatId: 'oc_direct',
      title: 'Movie night',
      options: ['A', 'B'],
    }, 'oc_direct')).rejects.toThrow('public_failed');

    expect(lark.deleteMessage).toHaveBeenCalledWith('cli_owner', 'om_control');
    const createdPoll = [...lark.sendMessage.mock.calls]
      .map(call => String(call[2]))
      .find(card => card.includes('poll_vote'));
    const createdPollId = createdPoll?.match(/poll_[0-9a-f-]{36}/u)?.[0];
    expect(createdPollId ? getPoll(createdPollId) : undefined).toBeUndefined();
  });

  it('removes the poll record when private control delivery fails', async () => {
    lark.sendMessage.mockRejectedValueOnce(new Error('control_failed'));

    await expect(createAndPublishPoll({
      ownerLarkAppId: 'cli_owner',
      creatorOpenId: 'ou_creator',
      chatId: 'oc_direct',
      title: 'Movie night',
      options: ['A', 'B'],
    }, 'oc_direct')).rejects.toThrow('control_failed');

    const controlCard = String(lark.sendMessage.mock.calls[0]?.[2]);
    const createdPollId = controlCard.match(/poll_[0-9a-f-]{36}/u)?.[0];
    expect(createdPollId ? getPoll(createdPollId) : undefined).toBeUndefined();
    expect(lark.deleteMessage).not.toHaveBeenCalled();
  });

  it('withdraws both cards and removes the poll record when binding fails', async () => {
    const invalidMessageId = 'x'.repeat(257);
    lark.sendMessage
      .mockResolvedValueOnce('om_control')
      .mockResolvedValueOnce(invalidMessageId);

    await expect(createAndPublishPoll({
      ownerLarkAppId: 'cli_owner',
      creatorOpenId: 'ou_creator',
      chatId: 'oc_direct',
      title: 'Movie night',
      options: ['A', 'B'],
    }, 'oc_direct')).rejects.toThrow('message_id_too_long');

    const publicCard = String(lark.sendMessage.mock.calls[1]?.[2]);
    const createdPollId = publicCard.match(/poll_[0-9a-f-]{36}/u)?.[0];
    expect(lark.deleteMessage).toHaveBeenCalledWith('cli_owner', invalidMessageId);
    expect(lark.deleteMessage).toHaveBeenCalledWith('cli_owner', 'om_control');
    expect(createdPollId ? getPoll(createdPollId) : undefined).toBeUndefined();
  });

  afterEach(() => {
    delete process.env.SESSION_DATA_DIR;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('binds a human vote to the owner bot and original message', () => {
    expect(castHumanPollVote({
      pollId,
      optionId: 'opt_1',
      ownerLarkAppId: 'cli_other',
      messageId: 'om_poll',
      openId: 'ou_user',
    })).toEqual({ ok: false, error: 'poll_not_found' });
    expect(castHumanPollVote({
      pollId,
      optionId: 'opt_1',
      ownerLarkAppId: 'cli_owner',
      messageId: 'om_other',
      openId: 'ou_user',
    })).toEqual({ ok: false, error: 'poll_not_found' });
    expect(castHumanPollVote({
      pollId,
      optionId: 'opt_1',
      ownerLarkAppId: 'cli_owner',
      messageId: 'om_poll',
      openId: 'ou_user',
    })).toMatchObject({ ok: true });
  });

  it('resolves a bot choice and rejects later changes', () => {
    expect(castBotPollVote({
      pollId,
      option: '1',
      larkAppId: 'cli_voter',
      displayName: 'Reviewer',
    })).toMatchObject({ ok: true });
    expect(castBotPollVote({
      pollId,
      option: 'opt_2',
      larkAppId: 'cli_voter',
      displayName: 'Reviewer',
    })).toEqual({ ok: false, error: 'already_voted' });
    expect(castBotPollVote({
      pollId,
      option: 'The Odyssey (14:15)',
      larkAppId: 'cli_voter',
      displayName: 'Reviewer',
    })).toEqual({ ok: false, error: 'already_voted' });
  });
});
