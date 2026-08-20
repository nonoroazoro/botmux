import {
  acceptCapabilityProposal,
  capabilityProposalDispatchUuid,
  createCapabilityContributionProposal,
  loadCapabilityProposal,
  rejectCapabilityProposal,
  type CapabilityProposal,
} from '../../core/capabilities/index.js';
import { localeForBot, t, type Locale } from '../../i18n/index.js';
import {
  CAPABILITY_ACCEPT_CONTRIBUTE_ACTION,
  CAPABILITY_REJECT_ACTION,
  buildCapabilityProposalCard,
  buildCapabilityProposalResultCard,
  capabilityProposalName,
  capabilityProposalType,
  parseCapabilityCardActionValue,
} from './capability-card.js';
import type { CardActionData } from './card-handler.js';

export interface CapabilityCardHandlerDeps {
  dataDir: string;
  ownerOpenId(larkAppId: string): string | undefined;
  resolveOperatorUnionId(data: CardActionData, larkAppId: string): Promise<string | undefined>;
  sendOwnerCard(
    larkAppId: string,
    ownerOpenId: string,
    card: string,
    dispatchUuid: string,
  ): Promise<void>;
  onAccepted?(proposal: CapabilityProposal): void | Promise<void>;
  onError?(proposalId: string, error: unknown): void;
}

function stale(locale?: Locale): unknown {
  return {
    toast: {
      type: 'warning',
      content: t('card.capability.toast.stale', undefined, locale),
    },
  };
}

export async function handleCapabilityCardAction(
  rawValue: unknown,
  data: CardActionData,
  receivingLarkAppId: string | undefined,
  deps: CapabilityCardHandlerDeps,
): Promise<unknown> {
  const locale = localeForBot(receivingLarkAppId);
  const value = parseCapabilityCardActionValue(rawValue);
  const operatorOpenId = data.operator?.open_id;
  if (!value || !operatorOpenId || !receivingLarkAppId) return stale(locale);
  const proposal = loadCapabilityProposal(deps.dataDir, value.proposalId);
  if (!proposal || proposal.larkAppId !== receivingLarkAppId) return stale(locale);
  if (
    value.action === CAPABILITY_ACCEPT_CONTRIBUTE_ACTION
    && (proposal.operation !== 'save' || proposal.targetScope.kind !== 'personal')
  ) return stale(locale);
  const operatorUnionId = await deps.resolveOperatorUnionId(data, receivingLarkAppId);
  const ownerOpenId = deps.ownerOpenId(receivingLarkAppId);
  try {
    if (value.action === CAPABILITY_REJECT_ACTION) {
      const rejected = rejectCapabilityProposal({
        dataDir: deps.dataDir,
        proposalId: value.proposalId,
        nonce: value.nonce,
        operatorOpenId,
        ...(operatorUnionId ? { operatorUnionId } : {}),
        ...(ownerOpenId ? { ownerOpenId } : {}),
      });
      return JSON.parse(buildCapabilityProposalResultCard({
        state: 'rejected',
        operation: rejected.operation,
        scope: rejected.targetScope.kind,
        type: capabilityProposalType(rejected),
        name: capabilityProposalName(rejected),
      }, locale));
    }
    if (value.action === CAPABILITY_ACCEPT_CONTRIBUTE_ACTION && !ownerOpenId) {
      return {
        toast: {
          type: 'warning',
          content: t('card.capability.toast.no_owner', undefined, locale),
        },
      };
    }
    const accepted = acceptCapabilityProposal({
      dataDir: deps.dataDir,
      proposalId: value.proposalId,
      nonce: value.nonce,
      operatorOpenId,
      ...(operatorUnionId ? { operatorUnionId } : {}),
      ...(ownerOpenId ? { ownerOpenId } : {}),
    });
    if (value.action === CAPABILITY_ACCEPT_CONTRIBUTE_ACTION) {
      if (
        accepted.operation !== 'save'
        || accepted.targetScope.kind !== 'personal'
        || !ownerOpenId
      ) throw new Error('Invalid contribution');
      const contribution = createCapabilityContributionProposal({
        dataDir: deps.dataDir,
        saveProposalId: accepted.proposalId,
        requesterOpenId: accepted.requesterOpenId,
      });
      try {
        await deps.sendOwnerCard(
          receivingLarkAppId,
          ownerOpenId,
          buildCapabilityProposalCard(contribution.proposal, contribution.nonce, locale),
          capabilityProposalDispatchUuid(contribution.proposal.proposalId, contribution.nonce),
        );
      } catch (error) {
        deps.onError?.(contribution.proposal.proposalId, error);
      }
    }
    try {
      await deps.onAccepted?.(accepted);
    } catch (error) {
      deps.onError?.(accepted.proposalId, error);
    }
    return JSON.parse(buildCapabilityProposalResultCard({
      state: 'accepted',
      operation: accepted.operation,
      scope: accepted.targetScope.kind,
      type: capabilityProposalType(accepted),
      name: capabilityProposalName(accepted),
    }, locale));
  } catch {
    return stale(locale);
  }
}
