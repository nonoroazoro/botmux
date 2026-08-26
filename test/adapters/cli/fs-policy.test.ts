import { describe, expect, it } from 'vitest';

import { accessForPath, buildFsPolicy } from '../../../src/adapters/cli/fs-policy.js';
import { soulStoreRoot } from '../../../src/core/personality/index.js';

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

describe('host-only filesystem policy', () => {
  it('keeps owner-managed Soul state denied despite broader or nested allow rules', () => {
    const dataDir = '/Users/u/.botmux/data';
    const root = soulStoreRoot(dataDir);
    const file = `${root}/cli_test.md`;
    const policy = buildFsPolicy({
      platform: 'darwin',
      homeDir: '/Users/u',
      botmuxHome: '/Users/u/.botmux',
      sessionDataDir: dataDir,
      workingDir: '/Users/u',
      currentAppId: 'cli_test',
      sessionId: 'session-a',
      botHome: '/Users/u/.botmux/bots/cli_test',
      redirectedCliData: true,
      userPaths: { readWrite: [file] },
      mandatoryReadOnlyPaths: [file],
      hostOnlyPaths: [root],
    });

    expect(accessForPath(policy.rules, root).access).toBe('deny');
    expect(accessForPath(policy.rules, file).access).toBe('deny');
    expect(policy.rules).not.toContainEqual(expect.objectContaining({
      path: file,
      access: 'readWrite',
    }));
  });

  it('fails closed when a sandbox working directory is host-only', () => {
    const dataDir = '/Users/u/.botmux/data';
    const root = soulStoreRoot(dataDir);

    expect(() => buildFsPolicy({
      platform: 'darwin',
      homeDir: '/Users/u',
      botmuxHome: '/Users/u/.botmux',
      sessionDataDir: dataDir,
      workingDir: root,
      currentAppId: 'cli_test',
      sessionId: 'session-a',
      botHome: '/Users/u/.botmux/bots/cli_test',
      redirectedCliData: true,
      hostOnlyPaths: [root],
    })).toThrow('host-only state');
  });
});
