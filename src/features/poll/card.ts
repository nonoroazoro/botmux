import type { PollRecord, PollVote } from './store.js';
import { getPollCopy } from './copy.js';
import { detectPollLocale, type PollLocale } from './locale.js';

const MAX_VISIBLE_VOTERS = 8;

function escapeMarkdown(value: string): string {
  return value
    .replaceAll('&', '&#38;')
    .replaceAll('<', '&#60;')
    .replaceAll('>', '&#62;')
    .replace(/([\\*~_\[\]()#])/gu, '\\$1');
}

function voterLabel(vote: PollVote): string {
  if (vote.kind === 'human' && vote.openId?.startsWith('ou_')) {
    return `<at id=${vote.openId}></at>`;
  }
  const name = escapeMarkdown(vote.displayName || 'Bot');
  return `🤖 ${name}`;
}

function resolvedLocale(poll: PollRecord): PollLocale {
  return poll.locale ?? detectPollLocale([
    poll.title,
    poll.description ?? '',
    ...poll.options.map(option => option.text),
  ]);
}

export function pollLocale(poll: PollRecord): PollLocale {
  return resolvedLocale(poll);
}

function optionVoters(poll: PollRecord, optionId: string): PollVote[] {
  return Object.values(poll.votes)
    .filter(vote => vote.optionId === optionId)
    .sort((a, b) => a.votedAt - b.votedAt);
}

function optionRow(poll: PollRecord, optionId: string, optionText: string): Record<string, unknown> {
  const locale = resolvedLocale(poll);
  const copy = getPollCopy(locale);
  const voters = optionVoters(poll, optionId);
  const resultsVisible = poll.closedAt !== undefined;
  const visible = voters.slice(0, MAX_VISIBLE_VOTERS).map(voterLabel).join('  ');
  const hidden = voters.length - MAX_VISIBLE_VOTERS;
  const voterLine = visible
    ? `${visible}${hidden > 0 ? `  <font color='grey'>+${hidden}</font>` : ''}`
    : `<font color='grey'>${copy.noVotes}</font>`;
  const voteCount = locale === 'zh'
    ? `${voters.length} ${copy.voteUnit}`
    : `${voters.length} ${copy.voteUnit}${voters.length === 1 ? '' : 's'}`;
  const content = resultsVisible
    ? `**${escapeMarkdown(optionText)}**\n${voteCount}  ${voterLine}`
    : `**${escapeMarkdown(optionText)}**`;
  const columns: Record<string, unknown>[] = [{
    tag: 'column',
    width: 'weighted',
    weight: 4,
    vertical_spacing: '4px',
    elements: [{
      tag: 'markdown',
      content,
    }],
  }];
  if (poll.closedAt === undefined) {
    columns.push({
      tag: 'column',
      width: 'weighted',
      weight: 1,
      vertical_align: 'center',
      elements: [{
        tag: 'button',
        text: { tag: 'plain_text', content: copy.voteButton },
        type: 'primary',
        width: 'fill',
        behaviors: [{
          type: 'callback',
          value: {
            action: 'poll_vote',
            poll_id: poll.id,
            option_id: optionId,
            key: `${poll.id}:${optionId}`,
          },
        }],
      }],
    });
  }
  return {
    tag: 'column_set',
    flex_mode: 'none',
    horizontal_spacing: '12px',
    columns,
  };
}

export function buildPollCard(poll: PollRecord): string {
  const locale = resolvedLocale(poll);
  const copy = getPollCopy(locale);
  const total = Object.keys(poll.votes).length;
  const participation = poll.eligibleVoterCount !== undefined
    ? `${total}/${poll.eligibleVoterCount}`
    : `${total}`;
  const optionRows = poll.options.map(option => optionRow(poll, option.id, option.text));
  const bodyElements: Record<string, unknown>[] = [];
  if (poll.description) {
    bodyElements.push({
      tag: 'markdown',
      content: escapeMarkdown(poll.description),
      margin: '0px 0px 12px 0px',
    });
  }
  bodyElements.push({
    tag: 'column_set',
    flex_mode: 'none',
    horizontal_spacing: '12px',
    background_style: 'blue-50',
    margin: '0px 0px 12px 0px',
    columns: [
      {
        tag: 'column',
        width: 'weighted',
        weight: 1,
        padding: '12px',
        vertical_spacing: '2px',
        elements: [
          { tag: 'markdown', content: `## <font color='blue'>${participation}</font>`, text_align: 'center' },
          { tag: 'markdown', content: `<font color='grey'>${copy.totalVotes}</font>`, text_align: 'center', text_size: 'notation' },
        ],
      },
      {
        tag: 'column',
        width: 'weighted',
        weight: 2,
        padding: '12px',
        vertical_align: 'center',
        elements: [{
          tag: 'markdown',
          content: `**${copy.singleChoice}**\n<font color='grey'>${poll.closedAt === undefined ? copy.openSubtitle : copy.finalResults}</font>`,
        }],
      },
    ],
  });
  bodyElements.push({
    tag: 'column_set',
    flex_mode: 'none',
    background_style: 'violet-50',
    columns: [{
      tag: 'column',
      width: 'weighted',
      weight: 1,
      padding: '12px',
      vertical_spacing: '12px',
      elements: optionRows,
    }],
  });

  return JSON.stringify({
    schema: '2.0',
    config: {
      update_multi: true,
      width_mode: 'default',
      summary: { content: `${copy.summaryPrefix}: ${poll.title}` },
    },
    header: {
      title: { tag: 'plain_text', content: poll.title },
      subtitle: {
        tag: 'plain_text',
        content: poll.closedAt === undefined ? copy.openSubtitle : copy.closedSubtitle,
      },
      template: 'blue',
      icon: { tag: 'standard_icon', token: 'vote_colorful' },
      text_tag_list: [{
        tag: 'text_tag',
        text: {
          tag: 'plain_text',
          content: poll.closedAt === undefined ? copy.tag : copy.closedTag,
        },
        color: poll.closedAt === undefined ? 'violet' : 'grey',
      }],
    },
    body: {
      direction: 'vertical',
      padding: '12px 12px 20px 12px',
      vertical_spacing: '0px',
      elements: bodyElements,
    },
  });
}

export function buildPollControlCard(poll: PollRecord): string {
  const copy = getPollCopy(resolvedLocale(poll));
  const ended = poll.closedAt !== undefined;
  return JSON.stringify({
    schema: '2.0',
    config: {
      update_multi: true,
      width_mode: 'default',
      summary: { content: `${copy.manageTitle}: ${poll.title}` },
    },
    header: {
      title: { tag: 'plain_text', content: copy.manageTitle },
      subtitle: { tag: 'plain_text', content: poll.title },
      template: ended ? 'grey' : 'blue',
      icon: { tag: 'standard_icon', token: 'vote_colorful' },
    },
    body: {
      direction: 'vertical',
      padding: '12px',
      vertical_spacing: '12px',
      elements: ended
        ? [{ tag: 'markdown', content: `✅ **${copy.ended}**` }]
        : [
            { tag: 'markdown', content: copy.manageHint },
            {
              tag: 'button',
              text: { tag: 'plain_text', content: copy.endPoll },
              type: 'danger',
              width: 'fill',
              behaviors: [{
                type: 'callback',
                value: { action: 'poll_close', poll_id: poll.id },
              }],
            },
          ],
    },
  });
}
