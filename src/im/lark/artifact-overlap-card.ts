import type { ArtifactOverlapPresentation, AskResult, PendingAsk } from '../../core/ask-types.js';
import { t, type Locale } from '../../i18n/index.js';

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
  if (result.kind === 'timedOut') return t('card.artifact_overlap.title.timeout', undefined, locale);
  if (result.kind === 'invalidated') return t('card.artifact_overlap.title.invalid', undefined, locale);
  if (result.comment) return t('card.artifact_overlap.title.revise', undefined, locale);
  const action = selectedAction(result);
  if (action === 'update') return t('card.artifact_overlap.title.update', undefined, locale);
  if (action === 'separate') return t('card.artifact_overlap.title.separate', undefined, locale);
  return t('card.artifact_overlap.title.cancel', undefined, locale);
}

function resultTemplate(result: AskResult): string {
  if (result.kind !== 'answered') return 'grey';
  if (result.comment) return 'orange';
  return selectedAction(result) === 'cancel' ? 'grey' : 'green';
}

function resultMessage(result: AskResult, locale?: Locale): string {
  if (result.kind === 'timedOut' || result.kind === 'invalidated') return '';
  if (result.comment) {
    return `**${t('card.artifact_overlap.result.request', undefined, locale)}**\n${escapeLarkMarkdown(truncate(result.comment, 1_000))}`;
  }
  const action = selectedAction(result);
  if (action === 'update') return t('card.artifact_overlap.result.update', undefined, locale);
  if (action === 'separate') return t('card.artifact_overlap.result.separate', undefined, locale);
  return t('card.artifact_overlap.result.cancel', undefined, locale);
}

export function buildArtifactOverlapCard(input: {
  ask: PendingAsk;
  presentation: ArtifactOverlapPresentation;
  selectAction: string;
  result?: AskResult;
  locale?: Locale;
}): string {
  const { ask, presentation, result, locale } = input;
  const typeLabel = t(`card.capability.type.${presentation.artifactType}`, undefined, locale);
  const elements: Array<Record<string, unknown>> = [
    {
      tag: 'div',
      fields: [
        {
          is_short: true,
          text: {
            tag: 'lark_md',
            content: `**${t('card.artifact_overlap.field.type', undefined, locale)}**\n${typeLabel}`,
          },
        },
        {
          is_short: true,
          text: {
            tag: 'lark_md',
            content: `**${t('card.artifact_overlap.field.proposed', undefined, locale)}**\n${escapeLarkMarkdown(presentation.proposedName)}`,
          },
        },
      ],
    },
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**${t('card.artifact_overlap.field.existing', undefined, locale)}**\n${escapeLarkMarkdown(presentation.existingName)}`,
      },
    },
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**${t('card.artifact_overlap.field.summary', undefined, locale)}**\n${escapeLarkMarkdown(truncate(presentation.summary, 1_800))}`,
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
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: t('card.artifact_overlap.button.update', undefined, locale) },
          type: 'primary',
          value: { action: input.selectAction, ask_id: ask.askId, nonce: ask.nonce, key: 'update' },
        },
        {
          tag: 'button',
          text: { tag: 'plain_text', content: t('card.artifact_overlap.button.separate', undefined, locale) },
          type: 'default',
          value: { action: input.selectAction, ask_id: ask.askId, nonce: ask.nonce, key: 'separate' },
        },
        {
          tag: 'button',
          text: { tag: 'plain_text', content: t('card.artifact_overlap.button.cancel', undefined, locale) },
          type: 'default',
          value: { action: input.selectAction, ask_id: ask.askId, nonce: ask.nonce, key: 'cancel' },
        },
      ],
    });
    elements.push({
      tag: 'note',
      elements: [{
        tag: 'plain_text',
        content: t('card.artifact_overlap.custom_reply_hint', undefined, locale),
      }],
    });
  }

  return JSON.stringify({
    config: { wide_screen_mode: true },
    header: {
      template: result ? resultTemplate(result) : 'orange',
      title: {
        tag: 'plain_text',
        content: result
          ? resultTitle(result, locale)
          : t('card.artifact_overlap.title', undefined, locale),
      },
    },
    elements,
  });
}
