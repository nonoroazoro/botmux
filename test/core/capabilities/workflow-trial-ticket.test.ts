import { afterEach, describe, expect, it } from 'vitest';

import {
  consumeWorkflowTrialTicket,
  issueWorkflowTrialTicket,
  readWorkflowTrialTicket,
  resetWorkflowTrialTicketsForTest,
  withWorkflowTrialTicket,
  type CapabilityDraft,
} from '../../../src/core/capabilities/index.js';

const draft: CapabilityDraft = {
  type: 'workflow',
  name: 'product-incident-report',
  description: 'Create a Product incident report.',
  instructions: '## Inputs\n- issue\n\n## Steps\n1. Inspect.\n\n## Success criteria\n- Reported.',
};

afterEach(() => {
  resetWorkflowTrialTicketsForTest();
});

describe('Workflow trial tickets', () => {
  it('authorizes one save of the exact trial draft', () => {
    const token = issueWorkflowTrialTicket({
      sessionId: 'session-1',
      turnId: 'turn-1',
      draft,
      now: 1_000,
    });

    expect(consumeWorkflowTrialTicket({
      token,
      sessionId: 'session-1',
      turnId: 'turn-1',
      now: 2_000,
    })).toEqual(draft);
    expect(() => consumeWorkflowTrialTicket({
      token,
      sessionId: 'session-1',
      turnId: 'turn-1',
      now: 2_000,
    })).toThrow(/trial confirmation/);
  });

  it('reads the exact draft without consuming the save ticket', () => {
    const token = issueWorkflowTrialTicket({
      sessionId: 'session-1',
      turnId: 'turn-1',
      draft,
      now: 1_000,
    });

    expect(readWorkflowTrialTicket({
      token,
      sessionId: 'session-1',
      turnId: 'turn-1',
      now: 2_000,
    })).toEqual(draft);
    expect(consumeWorkflowTrialTicket({
      token,
      sessionId: 'session-1',
      turnId: 'turn-1',
      now: 2_000,
    })).toEqual(draft);
  });

  it('rejects another turn without consuming the ticket', () => {
    const token = issueWorkflowTrialTicket({
      sessionId: 'session-1',
      turnId: 'turn-1',
      draft,
      now: 1_000,
    });

    expect(() => consumeWorkflowTrialTicket({
      token,
      sessionId: 'session-1',
      turnId: 'turn-2',
      now: 2_000,
    })).toThrow(/trial confirmation/);
    expect(consumeWorkflowTrialTicket({
      token,
      sessionId: 'session-1',
      turnId: 'turn-1',
      now: 2_000,
    })).toEqual(draft);
  });

  it('rejects an expired ticket', () => {
    const token = issueWorkflowTrialTicket({
      sessionId: 'session-1',
      turnId: 'turn-1',
      draft,
      now: 1_000,
    });

    expect(() => consumeWorkflowTrialTicket({
      token,
      sessionId: 'session-1',
      turnId: 'turn-1',
      now: 60 * 60 * 1_000 + 1_001,
    })).toThrow(/trial confirmation/);
  });

  it('restores a claimed ticket when its operation fails', async () => {
    const token = issueWorkflowTrialTicket({
      sessionId: 'session-1',
      turnId: 'turn-1',
      draft,
      now: 1_000,
    });

    await expect(withWorkflowTrialTicket({
      token,
      sessionId: 'session-1',
      turnId: 'turn-1',
      now: 2_000,
    }, async () => {
      throw new Error('card delivery failed');
    })).rejects.toThrow('card delivery failed');

    expect(consumeWorkflowTrialTicket({
      token,
      sessionId: 'session-1',
      turnId: 'turn-1',
      now: 2_000,
    })).toEqual(draft);
  });
});
