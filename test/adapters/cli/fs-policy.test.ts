import { describe, expect, it } from 'vitest';

import { accessForPath, buildFsPolicy } from '../../../src/adapters/cli/fs-policy.js';
import { soulStoreRoot } from '../../../src/core/personality/index.js';

describe('multi-user filesystem policy', () => {
  it.each(['linux', 'darwin'] as const)('keeps personal state writable and shared code read-only on %s', (platform) => {
    const policy = buildFsPolicy({
      platform,
      homeDir: '/var/lib/product/users/alice/home',
      isolatedUserHome: true,
      botmuxHome: '/home/service/.botmux',
      sessionDataDir: '/home/service/.botmux/data',
      workingDir: '/var/lib/product/users/alice/workspace',
      currentAppId: 'cli_test',
      sessionId: 'session-a',
      botHome: '/home/service/.botmux/bots/cli_test',
      redirectedCliData: true,
      readonlyRoots: ['/home/service/.agents/skills', '/opt/shared-tools'],
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
    for (const path of [
      '.local/share/sample-tool/data/token.json',
      '.config/git/config',
      '.gitconfig',
      '.npmrc',
      '.cargo/credentials.toml',
      '.cache/sample-tool/session.json',
      '.local/state/sample-tool/history.json',
      'Library/Application Support/sample-tool/auth.json',
      'Library/Preferences/sample-tool.plist',
    ]) {
      expect(accessForPath(policy.rules, `/var/lib/product/users/alice/home/${path}`).access, path)
        .toBe('readWrite');
      expect(accessForPath(policy.rules, `/var/lib/product/users/bob/home/${path}`).access, path)
        .toBe('none');
      expect(accessForPath(policy.rules, `/home/service/${path}`).access, path)
        .toBe('none');
    }
    expect(accessForPath(policy.rules, '/opt/shared-tools/sample-tool/bin/tool').access)
      .toBe('readOnly');
    expect(accessForPath(policy.rules, '/home/service/.agents/skills/sample/SKILL.md').access)
      .toBe('readOnly');
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
