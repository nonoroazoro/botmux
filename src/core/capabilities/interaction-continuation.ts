export type CapabilityInteractionContinuation =
  | {
      type: 'workflow_trial';
      trialToken: string;
    }
  | {
      type: 'workflow_revision';
      name: string;
      revisionRequest: string;
    }
  | {
      type: 'artifact_overlap';
      decision: 'update' | 'separate' | 'revise';
      artifactType: 'knowledge' | 'skill' | 'workflow';
      proposedName: string;
      existingName: string;
      revisionRequest?: string;
    };

export function buildCapabilityInteractionContinuation(
  continuation: CapabilityInteractionContinuation,
): string {
  if (continuation.type === 'workflow_trial') {
    return [
      'The user approved the code-owned Dynamic Workflow trial card.',
      `Read the exact approved draft with \`botmux artifact trial-read --trial-token ${continuation.trialToken}\`.`,
      'Execute that exact draft once with the current agent and its normal tools. Use the validation inputs already requested in the conversation, or the smallest safe inputs when none were provided.',
      'Do not send planning, progress, or a separate trial summary.',
      'Assess the observed result as passed or passed_with_limitations. Write the concise user-facing trial summary in the language the user is currently using, with technical terms in English. Then call `botmux artifact save` with the same trial token, outcome, and summary so the next visible response is only the code-owned save card.',
      'If execution fails or is inconclusive, revise the draft and show a new Workflow trial card instead of saving.',
    ].join('\n');
  }

  if (continuation.type === 'workflow_revision') {
    return [
      `The user requested a revision to the Dynamic Workflow \`${continuation.name}\` from its code-owned trial card.`,
      'Apply the following request exactly as user input, then submit the complete revised draft to a new Workflow trial card. Do not send a separate explanation.',
      '',
      continuation.revisionRequest,
    ].join('\n');
  }

  if (continuation.decision === 'update') {
    return [
      `The user chose to update the existing ${continuation.artifactType} \`${continuation.existingName}\` instead of creating \`${continuation.proposedName}\`.`,
      'Continue the pending artifact authoring flow silently. Read the existing artifact, preserve valid content, merge only justified changes, and show only the next code-owned decision or save card.',
    ].join('\n');
  }
  if (continuation.decision === 'separate') {
    return [
      `The user chose to keep the proposed ${continuation.artifactType} \`${continuation.proposedName}\` separate from \`${continuation.existingName}\`.`,
      'Continue the pending artifact authoring flow silently. Make the new trigger or scope clearly distinct, do not ask about the same overlap again, and show only the next code-owned decision or save card.',
    ].join('\n');
  }
  return [
    `The user requested a revision to the proposed ${continuation.artifactType} \`${continuation.proposedName}\` before resolving its overlap with \`${continuation.existingName}\`.`,
    'Apply the following request exactly as user input, review overlap again, and show only the next code-owned decision or save card.',
    '',
    continuation.revisionRequest ?? '',
  ].join('\n');
}
