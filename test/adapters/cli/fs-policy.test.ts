import { describe, expect, it } from 'vitest';

import { accessForPath, buildFsPolicy } from '../../../src/adapters/cli/fs-policy.js';

describe('multi-user filesystem policy', () => {
  it('allows credentials only inside the dedicated principal home', () => {
    const policy = buildFsPolicy({
      platform: 'linux',
      homeDir: '/var/lib/product/users/alice/home',
      isolatedUserHome: true,
      botmuxHome: '/home/service/.botmux',
      sessionDataDir: '/home/service/.botmux/data',
      workingDir: '/var/lib/product/users/alice/workspace',
      currentAppId: 'cli_test',
      sessionId: 'session-a',
      botHome: '/home/service/.botmux/bots/cli_test',
      redirectedCliData: true,
    });

    expect(accessForPath(policy.rules, '/var/lib/product/users/alice/home/.ssh/id_ed25519').access)
      .toBe('readWrite');
    expect(accessForPath(policy.rules, '/var/lib/product/users/bob/home/.ssh/id_ed25519').access)
      .toBe('none');
    expect(accessForPath(policy.rules, '/home/service/.botmux/bots/cli_test/codex/history.jsonl').access)
      .toBe('none');
    expect(accessForPath(policy.rules, '/home/service/.botmux/data/sessions-cli_test.json').access)
      .toBe('none');
    expect(accessForPath(policy.rules, '/var/lib/product/users/alice/home/.local/bin/sample-tool').access)
      .toBe('readWrite');
  });
});
