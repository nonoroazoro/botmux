import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTestTempDir } from './helpers/test-temp-dir.js';

async function freshStore() {
  vi.resetModules();
  return import('../src/services/substitute-chat-toggle-store.js');
}

describe('substitute chat toggle store', () => {
  beforeEach(() => {
    process.env.SESSION_DATA_DIR = makeTestTempDir('botmux-sub-chat-toggle-');
  });

  afterEach(() => {
    delete process.env.SESSION_DATA_DIR;
  });

  it('defaults to enabled, can disable, and can re-enable per chat', async () => {
    const store = await freshStore();

    expect(store.isSubstituteEnabledForChat('app_a', 'oc_1')).toBe(true);

    store.setSubstituteEnabledForChat('app_a', 'oc_1', false);
    expect(store.isSubstituteEnabledForChat('app_a', 'oc_1')).toBe(false);
    expect(store.isSubstituteEnabledForChat('app_a', 'oc_2')).toBe(true);
    expect(store.isSubstituteEnabledForChat('app_b', 'oc_1')).toBe(true);

    store.setSubstituteEnabledForChat('app_a', 'oc_1', true);
    expect(store.isSubstituteEnabledForChat('app_a', 'oc_1')).toBe(true);
  });
});
