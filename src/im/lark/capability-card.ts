import type {
  CapabilityType,
  CapabilityProposal,
  CapabilityProposalOperation,
} from '../../core/capabilities/index.js';
import { t, type Locale } from '../../i18n/index.js';

export const CAPABILITY_ACCEPT_ACTION = 'capability_accept';
export const CAPABILITY_ACCEPT_CONTRIBUTE_ACTION = 'capability_accept_contribute';
export const CAPABILITY_REJECT_ACTION = 'capability_reject';

export type CapabilityCardAction =
  | typeof CAPABILITY_ACCEPT_ACTION
  | typeof CAPABILITY_ACCEPT_CONTRIBUTE_ACTION
  | typeof CAPABILITY_REJECT_ACTION;

export interface CapabilityCardActionValue {
  action: CapabilityCardAction;
  proposalId: string;
  nonce: string;
}

function actionValue(
  action: CapabilityCardAction,
  proposalId: string,
  nonce: string,
): CapabilityCardActionValue {
  return { action, proposalId, nonce };
}

function summarizeInstructions(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length <= 800 ? compact : `${compact.slice(0, 797)}...`;
}

function escapeLarkMarkdown(value: string): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/([*_~`\[\]#])/g, '\\$1');
}

function capabilityTypeLabel(type: CapabilityType, locale?: Locale): string {
  return t(`card.capability.type.${type}`, undefined, locale);
}

export function capabilityProposalName(proposal: CapabilityProposal): string {
  return proposal.operation === 'delete' ? proposal.target.name : proposal.draft.name;
}

export function capabilityProposalType(proposal: CapabilityProposal): CapabilityType {
  return proposal.operation === 'delete' ? proposal.target.type : proposal.draft.type;
}

export function buildCapabilityProposalCard(
  proposal: CapabilityProposal,
  nonce: string,
  locale?: Locale,
): string {
  if (proposal.operation === 'delete') {
    const personal = proposal.targetScope.kind === 'personal';
    return JSON.stringify({
      config: { wide_screen_mode: true },
      header: {
        template: 'red',
        title: {
          tag: 'plain_text',
          content: t(
            personal
              ? 'card.capability.title.delete.personal'
              : 'card.capability.title.delete.bot',
            { type: capabilityTypeLabel(proposal.target.type, locale) },
            locale,
          ),
        },
      },
      elements: [
        {
          tag: 'div',
          fields: [
            {
              is_short: true,
              text: {
                tag: 'lark_md',
                content: `**${t('card.capability.field.type', undefined, locale)}**\n${escapeLarkMarkdown(capabilityTypeLabel(proposal.target.type, locale))}`,
              },
            },
            {
              is_short: true,
              text: {
                tag: 'lark_md',
                content: `**${t('card.capability.field.name', undefined, locale)}**\n${escapeLarkMarkdown(proposal.target.name)}`,
              },
            },
          ],
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**${t('card.capability.field.description', undefined, locale)}**\n${escapeLarkMarkdown(proposal.target.description)}`,
          },
        },
        {
          tag: 'note',
          elements: [{
            tag: 'plain_text',
            content: t('card.capability.note.delete', undefined, locale),
          }],
        },
        {
          tag: 'action',
          actions: [
            {
              tag: 'button',
              text: {
                tag: 'plain_text',
                content: t(
                  personal
                    ? 'card.capability.button.delete.personal'
                    : 'card.capability.button.delete.bot',
                  undefined,
                  locale,
                ),
              },
              type: 'danger',
              value: actionValue(CAPABILITY_ACCEPT_ACTION, proposal.proposalId, nonce),
            },
            {
              tag: 'button',
              text: {
                tag: 'plain_text',
                content: t('card.capability.button.cancel', undefined, locale),
              },
              type: 'default',
              value: actionValue(CAPABILITY_REJECT_ACTION, proposal.proposalId, nonce),
            },
          ],
        },
      ],
    });
  }
  const contribution = proposal.operation === 'contribute';
  const botSave = proposal.targetScope.kind === 'bot';
  const update = Boolean(proposal.expectedArtifactId && proposal.expectedRevisionId);
  const actions = contribution || botSave
    ? [
        {
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: contribution
              ? t(
                  update
                    ? 'card.capability.button.contribution.update'
                    : 'card.capability.button.contribution.publish',
                  undefined,
                  locale,
                )
              : t(
                  update
                    ? 'card.capability.button.bot.update'
                    : 'card.capability.button.bot.save',
                  undefined,
                  locale,
                ),
          },
          type: 'primary',
          value: actionValue(CAPABILITY_ACCEPT_ACTION, proposal.proposalId, nonce),
        },
        {
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: t(
              contribution
                ? 'card.capability.button.contribution.reject'
                : 'card.capability.button.cancel',
              undefined,
              locale,
            ),
          },
          type: 'default',
          value: actionValue(CAPABILITY_REJECT_ACTION, proposal.proposalId, nonce),
        },
      ]
    : [
        {
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: t(
              update
                ? 'card.capability.button.personal.update'
                : 'card.capability.button.personal.save',
              undefined,
              locale,
            ),
          },
          type: 'primary',
          value: actionValue(CAPABILITY_ACCEPT_ACTION, proposal.proposalId, nonce),
        },
        {
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: t(
              update
                ? 'card.capability.button.personal_contribute.update'
                : 'card.capability.button.personal_contribute.save',
              undefined,
              locale,
            ),
          },
          type: 'default',
          value: actionValue(CAPABILITY_ACCEPT_CONTRIBUTE_ACTION, proposal.proposalId, nonce),
        },
        {
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: t('card.capability.button.cancel', undefined, locale),
          },
          type: 'default',
          value: actionValue(CAPABILITY_REJECT_ACTION, proposal.proposalId, nonce),
        },
      ];
  return JSON.stringify({
    config: { wide_screen_mode: true },
    header: {
      template: contribution ? 'orange' : 'blue',
      title: {
        tag: 'plain_text',
        content: contribution
          ? t(
              update
                ? 'card.capability.title.contribution.update'
                : 'card.capability.title.contribution.publish',
              { type: capabilityTypeLabel(proposal.draft.type, locale) },
              locale,
            )
          : botSave
            ? t(
                update
                  ? 'card.capability.title.bot.update'
                  : 'card.capability.title.bot.save',
                { type: capabilityTypeLabel(proposal.draft.type, locale) },
                locale,
              )
            : t(
                update
                  ? 'card.capability.title.personal.update'
                  : 'card.capability.title.personal.save',
                { type: capabilityTypeLabel(proposal.draft.type, locale) },
                locale,
              ),
      },
    },
    elements: [
      {
        tag: 'div',
        fields: [
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**${t('card.capability.field.type', undefined, locale)}**\n${escapeLarkMarkdown(capabilityTypeLabel(proposal.draft.type, locale))}`,
            },
          },
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**${t('card.capability.field.name', undefined, locale)}**\n${escapeLarkMarkdown(proposal.draft.name)}`,
            },
          },
        ],
      },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**${t('card.capability.field.description', undefined, locale)}**\n${escapeLarkMarkdown(proposal.draft.description)}`,
        },
      },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**${t('card.capability.field.instructions', undefined, locale)}**\n${escapeLarkMarkdown(summarizeInstructions(proposal.draft.instructions))}`,
        },
      },
      ...(proposal.workflowTrial ? [
        { tag: 'hr' },
        {
          tag: 'div',
          fields: [{
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**${t('card.capability.field.workflow_trial_outcome', undefined, locale)}**\n${t(
                `card.capability.workflow_trial_outcome.${proposal.workflowTrial.outcome}`,
                undefined,
                locale,
              )}`,
            },
          }],
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**${t('card.capability.field.workflow_trial_summary', undefined, locale)}**\n${escapeLarkMarkdown(proposal.workflowTrial.summary)}`,
          },
        },
      ] : []),
      {
        tag: 'note',
        elements: [{
          tag: 'plain_text',
          content: contribution
            ? t('card.capability.note.contribution', undefined, locale)
            : botSave
              ? t('card.capability.note.bot', undefined, locale)
              : proposal.draft.type === 'workflow'
              ? t('card.capability.note.personal_workflow', undefined, locale)
              : t('card.capability.note.personal', undefined, locale),
        }],
      },
      { tag: 'action', actions },
    ],
  });
}

export function buildCapabilityProposalResultCard(input: {
  state: 'accepted' | 'rejected';
  operation: CapabilityProposalOperation;
  scope: 'personal' | 'bot';
  type: CapabilityType;
  name: string;
}, locale?: Locale): string {
  const accepted = input.state === 'accepted';
  const acceptedTitle = input.operation === 'delete'
    ? t(
        input.scope === 'personal'
          ? 'card.capability.result.deleted.personal'
          : 'card.capability.result.deleted.bot',
        undefined,
        locale,
      )
    : t(
        input.scope === 'personal'
          ? 'card.capability.result.saved.personal'
          : 'card.capability.result.saved.bot',
        undefined,
        locale,
      );
  return JSON.stringify({
    config: { wide_screen_mode: true },
    header: {
      template: accepted ? 'green' : 'grey',
      title: {
        tag: 'plain_text',
        content: accepted
          ? acceptedTitle
          : t(
              input.operation === 'delete'
                ? 'card.capability.result.delete_cancelled'
                : 'card.capability.result.cancelled',
              undefined,
              locale,
            ),
      },
    },
    elements: [{
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**${capabilityTypeLabel(input.type, locale)}:** ${escapeLarkMarkdown(input.name)}`,
      },
    }],
  });
}

export function isCapabilityCardAction(value: unknown): value is CapabilityCardAction {
  return value === CAPABILITY_ACCEPT_ACTION
    || value === CAPABILITY_ACCEPT_CONTRIBUTE_ACTION
    || value === CAPABILITY_REJECT_ACTION;
}

export function parseCapabilityCardActionValue(value: unknown): CapabilityCardActionValue | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const action = record.action;
  const proposalId = record.proposalId;
  const nonce = record.nonce;
  if (
    !isCapabilityCardAction(action)
    || typeof proposalId !== 'string'
    || !/^cp_[0-9a-f]{32}$/.test(proposalId)
    || typeof nonce !== 'string'
    || !/^[0-9a-f]{64}$/.test(nonce)
  ) return undefined;
  return { action, proposalId, nonce };
}
