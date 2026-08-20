import { describe, expect, it } from 'vitest';

import { validateWorkflowTrialAssessment } from '../../../src/core/capabilities/index.js';

describe('Workflow trial assessment', () => {
  it('normalizes a valid assessment', () => {
    expect(validateWorkflowTrialAssessment({
      outcome: 'passed_with_limitations',
      summary: '  Tested one issue. Live publication was not attempted.  ',
    })).toEqual({
      outcome: 'passed_with_limitations',
      summary: 'Tested one issue. Live publication was not attempted.',
    });
  });

  it('rejects empty or oversized summaries', () => {
    expect(() => validateWorkflowTrialAssessment({
      outcome: 'passed',
      summary: ' ',
    })).toThrow('Invalid Workflow trial summary');
    expect(() => validateWorkflowTrialAssessment({
      outcome: 'passed',
      summary: 'x'.repeat(2_049),
    })).toThrow('Invalid Workflow trial summary');
  });

  it('rejects summaries containing secrets', () => {
    expect(() => validateWorkflowTrialAssessment({
      outcome: 'passed',
      summary: 'Observed api_key=abcdefghijklmnop during the trial.',
    })).toThrow('may contain secrets');
  });
});
