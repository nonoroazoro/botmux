import { describe, expect, it } from 'vitest';
import { BOTMUX_UPDATE_FEATURE_ENABLED } from '../src/core/botmux-update-feature.js';

describe('botmux update feature', () => {
  it('is disabled by default', () => {
    expect(BOTMUX_UPDATE_FEATURE_ENABLED).toBe(false);
  });
});
