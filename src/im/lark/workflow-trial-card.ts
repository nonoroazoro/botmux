import type { AskResult, PendingAsk, WorkflowTrialPresentation } from '../../core/ask-types.js';
import { t, type Locale } from '../../i18n/index.js';

const MAX_INSTRUCTIONS_LENGTH = 1_800;

function escapeLarkMarkdown(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/([*_~`\[\]#])/g, '\\$1');
}

function truncate(value: string, maxLength: number): string {
  const normalized = value.trim();
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 3)}...`;
}

function selectedAction(result: AskResult): string | undefined {
  return result.kind === 'answered' ? result.answers[0]?.[0] : undefined;
}

function resultTitle(result: AskResult, locale?: Locale): string {
  if (result.kind === 'timedOut') return t('card.workflow_trial.title.timeout', undefined, locale);
  if (result.kind === 'invalidated') return t('card.workflow_trial.title.invalid', undefined, locale);
  if (result.comment) return t('card.workflow_trial.title.edit', undefined, locale);
  const action = selectedAction(result);
  if (action === 'run') return t('card.workflow_trial.title.run', undefined, locale);
  return t('card.workflow_trial.title.discard', undefined, locale);
}

function resultTemplate(result: AskResult): string {
  if (result.kind !== 'answered') return 'grey';
  if (result.comment) return 'orange';
  return selectedAction(result) === 'run' ? 'green' : 'grey';
}

function resultMessage(result: AskResult, locale?: Locale): string {
  if (result.kind === 'timedOut' || result.kind === 'invalidated') return '';
  if (result.comment) {
    return `**${t('card.workflow_trial.result.request', undefined, locale)}**\n${escapeLarkMarkdown(truncate(result.comment, 1_000))}`;
  }
  const action = selectedAction(result);
  if (action === 'run') return t('card.workflow_trial.result.run', undefined, locale);
  return t('card.workflow_trial.result.discard', undefined, locale);
}

export function buildWorkflowTrialCard(input: {
  ask: PendingAsk;
  presentation: WorkflowTrialPresentation;
  selectAction: string;
  result?: AskResult;
  locale?: Locale;
}): string {
  const { ask, presentation, result, locale } = input;
  const elements: Array<Record<string, unknown>> = [
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**${t('card.workflow_trial.field.name', undefined, locale)}**\n${escapeLarkMarkdown(presentation.name)}`,
      },
    },
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**${t('card.workflow_trial.field.description', undefined, locale)}**\n${escapeLarkMarkdown(presentation.description)}`,
      },
    },
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**${t('card.workflow_trial.field.instructions', undefined, locale)}**\n${escapeLarkMarkdown(truncate(presentation.instructions, MAX_INSTRUCTIONS_LENGTH))}`,
      },
    },
  ];

  if (result) {
    const message = resultMessage(result, locale);
    if (message) {
      elements.push({ tag: 'hr' });
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: message } });
    }
  } else {
    elements.push({
      tag: 'note',
      elements: [{
        tag: 'plain_text',
        content: t('card.workflow_trial.note', undefined, locale),
      }],
    });
    elements.push({
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: t('card.workflow_trial.button.run', undefined, locale) },
          type: 'primary',
          value: { action: input.selectAction, ask_id: ask.askId, nonce: ask.nonce, key: 'run' },
        },
        {
          tag: 'button',
          text: { tag: 'plain_text', content: t('card.workflow_trial.button.discard', undefined, locale) },
          type: 'default',
          value: { action: input.selectAction, ask_id: ask.askId, nonce: ask.nonce, key: 'discard' },
        },
      ],
    });
    elements.push({
      tag: 'note',
      elements: [{
        tag: 'plain_text',
        content: t('card.workflow_trial.custom_reply_hint', undefined, locale),
      }],
    });
  }

  return JSON.stringify({
    config: { wide_screen_mode: true },
    header: {
      template: result ? resultTemplate(result) : 'blue',
      title: {
        tag: 'plain_text',
        content: result
          ? resultTitle(result, locale)
          : t('card.workflow_trial.title', undefined, locale),
      },
    },
    elements,
  });
}
