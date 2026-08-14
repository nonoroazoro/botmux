import { describe, expect, it } from 'vitest';
import { buildPollCard, buildPollControlCard, type PollRecord } from '../../../src/features/poll/index.js';

describe('poll card', () => {
  it('renders a Card 2.0 poll with human and bot identities', () => {
    const poll: PollRecord = {
      schemaVersion: 1,
      id: 'poll_00000000-0000-0000-0000-000000000000',
      ownerLarkAppId: 'cli_owner',
      creatorOpenId: 'ou_creator',
      chatId: 'oc_movie',
      eligibleVoterCount: 12,
      messageId: 'om_poll',
      title: 'Movie night',
      description: 'Pick one movie',
      options: [
        { id: 'opt_1', text: 'The Odyssey (14:15)' },
        { id: 'opt_2', text: 'Option B' },
      ],
      votes: {
        'human:ou_user': {
          voterKey: 'human:ou_user',
          kind: 'human',
          optionId: 'opt_1',
          openId: 'ou_user',
          votedAt: 1,
        },
        'bot:cli_voter': {
          voterKey: 'bot:cli_voter',
          kind: 'bot',
          optionId: 'opt_1',
          displayName: 'Reviewer',
          votedAt: 2,
        },
      },
      createdAt: 1,
      closedAt: 3,
      updatedAt: 2,
    };

    const card = JSON.parse(buildPollCard(poll)) as Record<string, unknown>;
    const serialized = JSON.stringify(card);

    expect(card).toMatchObject({
      schema: '2.0',
      config: { update_multi: true, width_mode: 'default' },
      header: { template: 'blue', icon: { token: 'vote_colorful' } },
    });
    expect(serialized).not.toContain('poll_vote');
    expect(serialized).toContain('<at id=ou_user></at>');
    expect(serialized).toContain('🤖 Reviewer');
    expect(serialized).toContain('Participants');
    expect(serialized).toContain('2 votes');
    expect(serialized).toContain("<font color='blue'>2/12</font>");
    expect(serialized).not.toContain('created this poll');
    expect(serialized).not.toContain('Poll ID:');
  });

  it('localizes Chinese content and hides empty result counts', () => {
    const poll: PollRecord = {
      schemaVersion: 1,
      id: 'poll_00000000-0000-0000-0000-000000000000',
      ownerLarkAppId: 'cli_owner',
      creatorOpenId: 'ou_creator',
      chatId: 'oc_movie',
      eligibleVoterCount: 12,
      locale: 'zh',
      title: '今天看什么？',
      options: [
        { id: 'opt_1', text: '奥德赛' },
        { id: 'opt_2', text: '沙丘 3' },
      ],
      votes: {},
      createdAt: 1,
      updatedAt: 1,
    };

    const serialized = buildPollCard(poll);

    expect(serialized).toContain('投票');
    expect(serialized).not.toContain('Botmux');
    expect(serialized).toContain('结果将在结束后公布');
    expect(serialized).toContain('投票');
    expect(serialized).not.toContain('Total votes');
    expect(serialized).not.toContain('总票数');
    expect(serialized).not.toContain('暂无投票');
    expect(serialized).not.toContain('0 票');
    expect(serialized).toContain("<font color='blue'>0/12</font>");
  });

  it('hides existing votes while open and renders a separate creator control', () => {
    const poll: PollRecord = {
      schemaVersion: 1,
      id: 'poll_00000000-0000-0000-0000-000000000000',
      ownerLarkAppId: 'cli_owner',
      creatorOpenId: 'ou_creator',
      chatId: 'oc_movie',
      eligibleVoterCount: 12,
      locale: 'zh',
      title: '今天看什么？',
      options: [
        { id: 'opt_1', text: '奥德赛' },
        { id: 'opt_2', text: '沙丘 3' },
      ],
      votes: {
        'human:ou_user': {
          voterKey: 'human:ou_user',
          kind: 'human',
          optionId: 'opt_1',
          openId: 'ou_user',
          votedAt: 2,
        },
      },
      createdAt: 1,
      updatedAt: 2,
    };

    const publicCard = buildPollCard(poll);
    const controlCard = buildPollControlCard(poll);

    expect(publicCard).not.toContain('<at id=ou_user></at>');
    expect(publicCard).not.toContain('1 票');
    expect(publicCard).not.toContain('结束投票');
    expect(publicCard).toContain('参与人数');
    expect(publicCard).toContain("<font color='blue'>1/12</font>");
    expect(controlCard).toContain('结束投票');
    expect(controlCard).toContain('poll_close');
    expect(JSON.parse(controlCard)).toMatchObject({ config: { update_multi: true } });
  });
});
