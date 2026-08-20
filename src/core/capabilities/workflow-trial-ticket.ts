import { randomUUID } from 'node:crypto';

import { canonicalJsonStringify } from '../../utils/canonical-json.js';
import { validateCapabilityDraft } from './library-store.js';
import type { CapabilityDraft } from './types.js';

const WORKFLOW_TRIAL_TTL_MS = 60 * 60 * 1_000;
const WORKFLOW_TRIAL_TOKEN_RE = /^wft_[0-9a-f]{32}$/;

interface WorkflowTrialTicket {
  token: string;
  sessionId: string;
  turnId: string;
  draft: string;
  expiresAt: number;
}

const tickets = new Map<string, WorkflowTrialTicket>();

function reapExpiredWorkflowTrialTickets(now: number): void {
  for (const [token, ticket] of tickets) {
    if (ticket.expiresAt <= now) tickets.delete(token);
  }
}

export function issueWorkflowTrialTicket(input: {
  sessionId: string;
  turnId: string;
  draft: CapabilityDraft;
  now?: number;
}): string {
  const draft = validateCapabilityDraft(input.draft);
  if (draft.type !== 'workflow' || !input.sessionId.trim() || !input.turnId.trim()) {
    throw new Error('Invalid Workflow trial ticket input');
  }
  const now = input.now ?? Date.now();
  reapExpiredWorkflowTrialTickets(now);
  const token = `wft_${randomUUID().replace(/-/g, '')}`;
  tickets.set(token, {
    token,
    sessionId: input.sessionId,
    turnId: input.turnId,
    draft: canonicalJsonStringify(draft),
    expiresAt: now + WORKFLOW_TRIAL_TTL_MS,
  });
  return token;
}

export function consumeWorkflowTrialTicket(input: {
  token: string;
  sessionId: string;
  turnId: string;
  now?: number;
}): CapabilityDraft {
  const now = input.now ?? Date.now();
  reapExpiredWorkflowTrialTickets(now);
  if (!WORKFLOW_TRIAL_TOKEN_RE.test(input.token)) {
    throw new Error('A valid Workflow trial confirmation is required');
  }
  const ticket = tickets.get(input.token);
  if (
    !ticket
    || ticket.sessionId !== input.sessionId
    || ticket.turnId !== input.turnId
  ) throw new Error('A valid Workflow trial confirmation is required');
  tickets.delete(input.token);
  return validateCapabilityDraft(JSON.parse(ticket.draft) as CapabilityDraft);
}

export function readWorkflowTrialTicket(input: {
  token: string;
  sessionId: string;
  turnId: string;
  now?: number;
}): CapabilityDraft {
  const now = input.now ?? Date.now();
  reapExpiredWorkflowTrialTickets(now);
  if (!WORKFLOW_TRIAL_TOKEN_RE.test(input.token)) {
    throw new Error('A valid Workflow trial confirmation is required');
  }
  const ticket = tickets.get(input.token);
  if (
    !ticket
    || ticket.sessionId !== input.sessionId
    || ticket.turnId !== input.turnId
  ) throw new Error('A valid Workflow trial confirmation is required');
  return validateCapabilityDraft(JSON.parse(ticket.draft) as CapabilityDraft);
}

export function resetWorkflowTrialTicketsForTest(): void {
  tickets.clear();
}
