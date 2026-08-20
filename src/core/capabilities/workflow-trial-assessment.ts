import type { WorkflowTrialAssessment } from './types.js';
import { findSensitiveCapabilityContent } from './redaction.js';

const MAX_WORKFLOW_TRIAL_SUMMARY_BYTES = 2_048;

export function validateWorkflowTrialAssessment(
  input: unknown,
): WorkflowTrialAssessment {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid Workflow trial assessment');
  }
  const record = input as Record<string, unknown>;
  if (record.outcome !== 'passed' && record.outcome !== 'passed_with_limitations') {
    throw new Error('Invalid Workflow trial outcome');
  }
  if (typeof record.summary !== 'string') {
    throw new Error('Invalid Workflow trial summary');
  }
  const summary = record.summary.trim().normalize('NFC');
  if (
    !summary
    || summary.includes('\0')
    || Buffer.byteLength(summary, 'utf8') > MAX_WORKFLOW_TRIAL_SUMMARY_BYTES
  ) {
    throw new Error('Invalid Workflow trial summary');
  }
  if (findSensitiveCapabilityContent(summary).length > 0) {
    throw new Error('Workflow trial summary may contain secrets');
  }
  return { outcome: record.outcome, summary };
}
