import type {
  AskResult,
  PendingAsk,
} from '../../core/ask-types.js';
import type { SafeRecoveryExecutionStatus } from '../../types.js';
import { t, type Locale } from '../../i18n/index.js';

function selectedAction(result: AskResult): string | undefined {
  return result.kind === 'answered' ? result.answers[0]?.[0] : undefined;
}

function settledTitle(result: AskResult, locale?: Locale): string {
  if (result.kind === 'timedOut') return t('card.safe_recovery.title.timeout', undefined, locale);
  if (result.kind === 'invalidated') return t('card.safe_recovery.title.invalid', undefined, locale);
  return selectedAction(result) === 'confirm'
    ? t('card.safe_recovery.title.confirmed', undefined, locale)
    : t('card.safe_recovery.title.cancelled', undefined, locale);
}

function settledMessage(result: AskResult, locale?: Locale): string {
  if (result.kind === 'timedOut' || result.kind === 'invalidated') {
    return t('card.safe_recovery.result.not_started', undefined, locale);
  }
  return selectedAction(result) === 'confirm'
    ? t('card.safe_recovery.result.confirmed', undefined, locale)
    : t('card.safe_recovery.result.cancelled', undefined, locale);
}

/**
 * Build the dedicated confirmation card for a policy-blocked Codex
 * conversation. Recovery context and caller identity never enter card values.
 */
export function buildSafeRecoveryCard(input: {
  ask: PendingAsk;
  selectAction: string;
  result?: AskResult;
  locale?: Locale;
}): string {
  const { ask, result, locale } = input;
  const elements: Array<Record<string, unknown>> = result
    ? [{
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: settledMessage(result, locale),
        },
      }]
    : [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**${t('card.safe_recovery.field.problem', undefined, locale)}**\n`
              + t('card.safe_recovery.problem', undefined, locale),
          },
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**${t('card.safe_recovery.field.option', undefined, locale)}**\n`
              + t('card.safe_recovery.option', undefined, locale),
          },
        },
        {
          tag: 'note',
          elements: [{
            tag: 'plain_text',
            content: t('card.safe_recovery.context_warning', undefined, locale),
          }],
        },
      ];

  if (!result) {
    elements.push({
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: t('card.safe_recovery.button.confirm', undefined, locale) },
          type: 'primary',
          value: {
            action: input.selectAction,
            ask_id: ask.askId,
            nonce: ask.nonce,
            key: 'confirm',
          },
        },
        {
          tag: 'button',
          text: { tag: 'plain_text', content: t('card.safe_recovery.button.cancel', undefined, locale) },
          type: 'default',
          value: {
            action: input.selectAction,
            ask_id: ask.askId,
            nonce: ask.nonce,
            key: 'cancel',
          },
        },
      ],
    });
  }

  return JSON.stringify({
    config: { wide_screen_mode: true },
    header: {
      template: result && selectedAction(result) === 'confirm' ? 'blue' : result ? 'grey' : 'orange',
      title: {
        tag: 'plain_text',
        content: result
          ? settledTitle(result, locale)
          : t('card.safe_recovery.title', undefined, locale),
      },
    },
    elements,
  });
}

/**
 * Build the final card after the worker reports whether recovery started.
 */
export function buildSafeRecoveryExecutionCard(input: {
  status: SafeRecoveryExecutionStatus;
  locale?: Locale;
}): string {
  const { status, locale } = input;
  const title = status === 'started'
    ? t('card.safe_recovery.title.started', undefined, locale)
    : status === 'failed'
      ? t('card.safe_recovery.title.failed', undefined, locale)
      : t('card.safe_recovery.title.unknown', undefined, locale);
  const message = status === 'started'
    ? t('card.safe_recovery.result.started', undefined, locale)
    : status === 'failed'
      ? t('card.safe_recovery.result.failed', undefined, locale)
      : t('card.safe_recovery.result.unknown', undefined, locale);
  return JSON.stringify({
    config: { wide_screen_mode: true },
    header: {
      template: status === 'started' ? 'green' : status === 'failed' ? 'red' : 'orange',
      title: {
        tag: 'plain_text',
        content: title,
      },
    },
    elements: [{
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: message,
      },
    }],
  });
}
