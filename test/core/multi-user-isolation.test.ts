import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveMultiUserSessionPaths } from '../../src/core/multi-user-isolation.js';
import { makeTestTempDir } from '../helpers/test-temp-dir.js';

const roots: string[] = [];
const defaultGitIdentity = {
  name: 'Product Assistant',
  email: 'product-assistant@botmux.local',
} as const;

function resolveAlice(root: string): ReturnType<typeof resolveMultiUserSessionPaths> {
  return resolveMultiUserSessionPaths({
    config: {
      enabled: true,
      root,
      ownerOnlyTopics: true,
      defaultGitIdentity,
    },
    principalOpenId: 'ou_alice',
    requestedWorkingDir: '/srv/shared/Workspace',
    defaultWorkingDir: '/srv/shared/Workspace',
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('resolveMultiUserSessionPaths', () => {
  it('maps a shared default workspace into a stable principal workspace', () => {
    const root = makeTestTempDir('botmux-multi-user-');
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
    expect(readFileSync(join(result.homeDir, '.botmux-gitconfig'), 'utf8')).toContain('Example Bot');
    expect(execFileSync('git', ['config', 'user.name'], {
      env: {
        ...process.env,
        HOME: result.homeDir,
        GIT_CONFIG_SYSTEM: join(result.homeDir, '.botmux-gitconfig'),
      },
      encoding: 'utf8',
    }).trim()).toBe('Example Bot');
    expect(statSync(root).mode & 0o777).toBe(0o700);
  });

  it('lets user Git identity override the Bot fallback', () => {
    const root = makeTestTempDir('botmux-multi-user-');
    roots.push(root);
    const result = resolveAlice(root);
    const gitEnv = {
      ...process.env,
      HOME: result.homeDir,
      GIT_CONFIG_SYSTEM: join(result.homeDir, '.botmux-gitconfig'),
    };
    execFileSync('git', ['config', '--global', 'user.name', 'yuchao.k'], { env: gitEnv });
    execFileSync('git', ['config', '--global', 'user.email', 'yuchao.k@example.com'], { env: gitEnv });

    resolveAlice(root);

    expect(execFileSync('git', ['config', 'user.name'], {
      env: gitEnv,
      encoding: 'utf8',
    }).trim()).toBe('yuchao.k');
    expect(execFileSync('git', ['config', 'user.email'], {
      env: gitEnv,
      encoding: 'utf8',
    }).trim()).toBe('yuchao.k@example.com');
  });

  it('keeps the native local, global, system Git identity priority', () => {
    const root = makeTestTempDir('botmux-multi-user-');
    roots.push(root);
    const result = resolveAlice(root);
    writeFileSync(
      join(result.homeDir, '.gitconfig'),
      '[user]\n\tname = yuchao.k\n\temail = yuchao.k@example.com\n',
      { mode: 0o600 },
    );
    const repository = join(result.workingDir, 'example');
    mkdirSync(repository, { recursive: true });
    const gitEnv = {
      ...process.env,
      HOME: result.homeDir,
      GIT_CONFIG_SYSTEM: join(result.homeDir, '.botmux-gitconfig'),
    };
    execFileSync('git', ['init', '--quiet'], { cwd: repository, env: gitEnv });
    execFileSync('git', ['config', 'user.name', 'Repository Author'], {
      cwd: repository,
      env: gitEnv,
    });
    execFileSync('git', ['config', 'user.email', 'repository@example.com'], {
      cwd: repository,
      env: gitEnv,
    });

    expect(execFileSync('git', ['config', 'user.name'], {
      cwd: repository,
      env: gitEnv,
      encoding: 'utf8',
    }).trim()).toBe('Repository Author');
    expect(execFileSync('git', ['config', 'user.email'], {
      cwd: repository,
      env: gitEnv,
      encoding: 'utf8',
    }).trim()).toBe('repository@example.com');
  });

  it('rejects a symlinked principal SSH directory', () => {
    const root = makeTestTempDir('botmux-multi-user-');
    roots.push(root);
    const input = {
      config: { enabled: true, root, ownerOnlyTopics: true },
      principalOpenId: 'ou_alice',
      requestedWorkingDir: '/srv/shared/Workspace',
      defaultWorkingDir: '/srv/shared/Workspace',
    } as const;
    const result = resolveMultiUserSessionPaths(input);
    rmSync(join(result.homeDir, '.ssh'), { recursive: true });
    const foreignSsh = join(root, 'foreign-ssh');
    mkdirSync(foreignSsh);
    symlinkSync(foreignSsh, join(result.homeDir, '.ssh'));

    expect(() => resolveMultiUserSessionPaths(input)).toThrow(
      'multi-user isolation path must be a real directory',
    );
  });

  it('uses different persistent roots for different principals', () => {
    const root = makeTestTempDir('botmux-multi-user-');
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
    const root = makeTestTempDir('botmux-multi-user-');
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
    const root = makeTestTempDir('botmux-multi-user-');
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
