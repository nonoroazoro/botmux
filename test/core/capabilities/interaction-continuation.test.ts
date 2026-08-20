import { describe, expect, it } from 'vitest';

import { buildCapabilityInteractionContinuation } from '../../../src/core/capabilities/index.js';

describe('Capability interaction continuation', () => {
  it('offloads the exact Workflow draft behind its trial token', () => {
    const prompt = buildCapabilityInteractionContinuation({
      type: 'workflow_trial',
      trialToken: 'wft_0123456789abcdef0123456789abcdef',
    });

    expect(prompt).toContain('artifact trial-read --trial-token wft_0123456789abcdef0123456789abcdef');
    expect(prompt).toContain('current agent and its normal tools');
    expect(prompt).toContain('language the user is currently using');
    expect(prompt).toContain('technical terms in English');
    expect(prompt).not.toContain('## Steps');
  });

  it('preserves an overlap revision request as user input', () => {
    const prompt = buildCapabilityInteractionContinuation({
      type: 'artifact_overlap',
      decision: 'revise',
      artifactType: 'skill',
      proposedName: 'new-skill',
      existingName: 'old-skill',
      revisionRequest: 'Keep the output shorter.',
    });

    expect(prompt).toContain('Keep the output shorter.');
    expect(prompt).toContain('review overlap again');
  });
});
