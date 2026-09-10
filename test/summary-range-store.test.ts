import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SUMMARY_LIMIT,
  DEFAULT_SUMMARY_SINCE_HOURS,
  defaultSummaryRangePrefs,
  summaryRangeFromBotConfig,
} from '../src/services/summary-range-store.js';
describe('dashboard summary range', () => {
  it('defaults to 50 messages and 24 hours', () => {
    expect(defaultSummaryRangePrefs()).toEqual({
      limit: DEFAULT_SUMMARY_LIMIT,
      sinceHours: DEFAULT_SUMMARY_SINCE_HOURS,
    });
    expect(summaryRangeFromBotConfig({})).toEqual(defaultSummaryRangePrefs());
  });

  it('reads the configured summary range', () => {
    expect(summaryRangeFromBotConfig({
      summaryRange: { limit: 12, sinceHours: 6 },
    })).toEqual({
      limit: 12,
      sinceHours: 6,
    });
  });
});
