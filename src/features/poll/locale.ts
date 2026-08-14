export type PollLocale = 'zh' | 'en';

export function detectPollLocale(values: string[]): PollLocale {
  return values.some(value => /\p{Script=Han}/u.test(value)) ? 'zh' : 'en';
}
