import { describe, expect, it } from 'vitest';
import {
  isPersonalityReaction,
  PERSONALITY_REACTION_EMOJIS,
} from '../../../src/core/personality/index.js';

describe('personality reaction types', () => {
  it('maps every supported semantic reaction to a Feishu emoji type', () => {
    expect(PERSONALITY_REACTION_EMOJIS).toEqual({
      yes: 'Yes',
      no: 'No',
      heart: 'HEART',
      like: 'THUMBSUP',
      done: 'DONE',
    });
    expect(isPersonalityReaction('done')).toBe(true);
    expect(isPersonalityReaction('progress')).toBe(false);
  });
});
