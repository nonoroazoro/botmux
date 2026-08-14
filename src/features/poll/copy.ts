import type { PollLocale } from './locale.js';

const ZH_COPY = {
  summaryPrefix: '投票',
  tag: '投票',
  closedTag: '已结束',
  openSubtitle: '单选 · 结果将在结束后公布',
  closedSubtitle: '投票已结束 · 最终结果',
  totalVotes: '参与人数',
  singleChoice: '单选',
  finalResults: '最终结果',
  noVotes: '暂无投票',
  voteButton: '投票',
  voteUnit: '票',
  manageTitle: '投票管理',
  manageHint: '仅你可以结束这个投票。结束后，最终结果会在群里公布。',
  endPoll: '结束投票',
  ended: '投票已结束',
  invalidAction: '无效的投票操作',
  optionUnavailable: '这个选项已不存在',
  pollUnavailable: '这个投票已不可用',
  pollClosed: '投票已经结束',
  notCreator: '只有投票发起人可以结束投票',
  voteRecorded: '投票成功',
  alreadyVoted: '你已经投过票，不能修改',
  pollEnded: '投票已结束，最终结果已公布',
  pollEndedRefreshFailed: '投票已结束，但结果卡片暂时未能刷新',
} as const;

const EN_COPY = {
  summaryPrefix: 'Poll',
  tag: 'Poll',
  closedTag: 'Ended',
  openSubtitle: 'Single choice · Results shown after the poll ends',
  closedSubtitle: 'Poll ended · Final results',
  totalVotes: 'Participants',
  singleChoice: 'Single choice',
  finalResults: 'Final results',
  noVotes: 'No votes yet',
  voteButton: 'Vote',
  voteUnit: 'vote',
  manageTitle: 'Poll controls',
  manageHint: 'Only you can end this poll. Final results will be published in the chat.',
  endPoll: 'End poll',
  ended: 'Poll ended',
  invalidAction: 'Invalid poll action',
  optionUnavailable: 'This option no longer exists',
  pollUnavailable: 'This poll is unavailable',
  pollClosed: 'This poll has ended',
  notCreator: 'Only the poll creator can end this poll',
  voteRecorded: 'Vote recorded',
  alreadyVoted: 'You have already voted and cannot change it',
  pollEnded: 'Poll ended and final results published',
  pollEndedRefreshFailed: 'Poll ended, but the result card could not refresh',
} as const;

export function getPollCopy(locale: PollLocale): typeof ZH_COPY | typeof EN_COPY {
  return locale === 'zh' ? ZH_COPY : EN_COPY;
}
