import { describe, expect, it } from 'vitest';
import { personalityReactionsEnabled } from '../../../src/core/personality/index.js';

describe('personality reaction configuration', () => {
  it('defaults to enabled and respects transport and owner settings', () => {
    expect(personalityReactionsEnabled({})).toBe(true);
    expect(personalityReactionsEnabled({ personalityReactions: true })).toBe(true);
    expect(personalityReactionsEnabled({ personalityReactions: false })).toBe(false);
    expect(personalityReactionsEnabled({ apiOnly: true })).toBe(false);
  });
});
