import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveMultiUserSessionPaths } from '../../src/core/multi-user-isolation.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('resolveMultiUserSessionPaths', () => {
  it('maps a shared default workspace into a stable principal workspace', () => {
    const root = mkdtempSync(join(tmpdir(), 'botmux-multi-user-'));
    chmodSync(root, 0o755);
    roots.push(root);
    const result = resolveMultiUserSessionPaths({
      config: {
        enabled: true,
        root,
        ownerOnlyTopics: true,
        defaultGitIdentity: {
          name: 'Example Bot',
          email: 'example-bot@example.com',
        },
      },
      principalOpenId: 'ou_alice',
      requestedWorkingDir: '/srv/shared/Workspace/project-a',
      defaultWorkingDir: '/srv/shared/Workspace',
    });

    expect(result.workingDir).toMatch(/\/workspace\/project-a$/u);
    expect(readFileSync(join(result.homeDir, '.gitconfig'), 'utf8')).toContain('Example Bot');
    expect(statSync(root).mode & 0o777).toBe(0o700);
  });

  it('uses different persistent roots for different principals', () => {
    const root = mkdtempSync(join(tmpdir(), 'botmux-multi-user-'));
    roots.push(root);
    const resolveFor = (principalOpenId: string) => resolveMultiUserSessionPaths({
      config: { enabled: true, root, ownerOnlyTopics: true },
      principalOpenId,
      requestedWorkingDir: '/srv/shared/Workspace',
      defaultWorkingDir: '/srv/shared/Workspace',
    });

    expect(resolveFor('ou_alice').homeDir).not.toBe(resolveFor('ou_bob').homeDir);
  });

  it('creates the principal workspace without a shared default directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'botmux-multi-user-'));
    roots.push(root);
    const result = resolveMultiUserSessionPaths({
      config: { enabled: true, root, ownerOnlyTopics: true },
      principalOpenId: 'ou_alice',
      requestedWorkingDir: homedir(),
    });

    expect(result.workingDir).toMatch(/\/workspace$/u);
    expect(statSync(result.workingDir).isDirectory()).toBe(true);
  });

  it('rejects a working directory outside the principal workspace mapping', () => {
    const root = mkdtempSync(join(tmpdir(), 'botmux-multi-user-'));
    roots.push(root);

    expect(() => resolveMultiUserSessionPaths({
      config: { enabled: true, root, ownerOnlyTopics: true },
      principalOpenId: 'ou_alice',
      requestedWorkingDir: '/srv/private/other-user',
      defaultWorkingDir: '/srv/shared/Workspace',
    })).toThrow('outside the isolated workspace');
  });

  it('rejects a relative isolation root', () => {
    expect(() => resolveMultiUserSessionPaths({
      config: { enabled: true, root: 'relative/users', ownerOnlyTopics: true },
      principalOpenId: 'ou_alice',
      requestedWorkingDir: '/srv/shared/Workspace',
      defaultWorkingDir: '/srv/shared/Workspace',
    })).toThrow('must be absolute');
  });
});
