export const PERSONALITY_REACTION_EMOJIS = {
  yes: 'Yes',
  no: 'No',
  heart: 'HEART',
  like: 'THUMBSUP',
  done: 'DONE',
} as const;

export type PersonalityReaction = keyof typeof PERSONALITY_REACTION_EMOJIS;

export function isPersonalityReaction(value: string): value is PersonalityReaction {
  return Object.hasOwn(PERSONALITY_REACTION_EMOJIS, value);
}
