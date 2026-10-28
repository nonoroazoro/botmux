import { describe, expect, it } from 'vitest';

import { buildBotmuxEnvAssignments } from '../src/adapters/backend/tmux-backend.js';
import { tmuxEnv } from '../src/setup/ensure-tmux.js';
import { zellijEnv } from '../src/setup/ensure-zellij.js';
import { setIsolatedUserHome } from '../src/core/multi-user-env.js';

describe('isolated user environment', () => {
  it('carries private data roots into the pane without seeding shared servers or allowing overrides', () => {
    const env: NodeJS.ProcessEnv = { PATH: '/usr/local/bin:/usr/bin' };
    setIsolatedUserHome(env, '/users/alice/home');
    const overrides = {
      HOME: '/home/service',
      XDG_DATA_HOME: '/host/data',
      XDG_CACHE_HOME: '/host/cache',
      XDG_STATE_HOME: '/host/state',
      XDG_RUNTIME_DIR: '/run/user/1000',
      GIT_CONFIG_GLOBAL: '/host/gitconfig',
      OPENAI_API_KEY: 'provider-key',
    };
    const assignments = buildBotmuxEnvAssignments(env, overrides, true);
    for (const key of ['HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME']) {
      expect(tmuxEnv(env, true)[key]).toBeUndefined();
      expect(zellijEnv(env, true)[key]).toBeUndefined();
      expect(assignments.filter(value => value.startsWith(`${key}=`))).toEqual([`${key}=${env[key]}`]);
    }
    expect(assignments).not.toContain('XDG_RUNTIME_DIR=/run/user/1000');
    expect(assignments).not.toContain('GIT_CONFIG_GLOBAL=/host/gitconfig');
    expect(assignments).toContain('OPENAI_API_KEY=provider-key');
  });

  it('keeps user-scoped values out of shared tmux server state', () => {
    const env = {
      HOME: '/users/alice/home',
      PATH: '/usr/bin',
      GIT_CONFIG_SYSTEM: '/users/alice/home/.botmux-gitconfig',
      XDG_CONFIG_HOME: '/users/alice/home/.config',
    };

    const serverEnv = tmuxEnv(env, true);
    expect(serverEnv.HOME).toBeUndefined();
    expect(serverEnv.GIT_CONFIG_SYSTEM).toBeUndefined();
    expect(serverEnv.XDG_CONFIG_HOME).toBeUndefined();
    expect(serverEnv.PATH).toContain('/usr/bin');
    expect(zellijEnv(env, true).HOME).toBeUndefined();
    expect(zellijEnv(env, true).GIT_CONFIG_SYSTEM).toBeUndefined();

    expect(buildBotmuxEnvAssignments(env, undefined, true)).toEqual(expect.arrayContaining([
      'HOME=/users/alice/home',
      'GIT_CONFIG_SYSTEM=/users/alice/home/.botmux-gitconfig',
      'XDG_CONFIG_HOME=/users/alice/home/.config',
    ]));
  });

  it('preserves ordinary CLI HOME and XDG environment', () => {
    const env = {
      HOME: '/home/service',
      PATH: '/usr/bin',
      XDG_CONFIG_HOME: '/home/service/.config',
    };

    expect(tmuxEnv(env)).toMatchObject({
      HOME: env.HOME,
      XDG_CONFIG_HOME: env.XDG_CONFIG_HOME,
    });
    expect(tmuxEnv(env).PATH).toContain(env.PATH);
    expect(zellijEnv(env)).toMatchObject({
      HOME: env.HOME,
      XDG_CONFIG_HOME: env.XDG_CONFIG_HOME,
    });
    expect(buildBotmuxEnvAssignments(env)).not.toContain('HOME=/home/service');
    expect(buildBotmuxEnvAssignments(env)).not.toContain('XDG_CONFIG_HOME=/home/service/.config');
  });

  it('isolates HOME even without a Git fallback', () => {
    const env = {
      HOME: '/users/alice/home',
      PATH: '/usr/bin',
      XDG_CONFIG_HOME: '/users/alice/home/.config',
    };

    expect(tmuxEnv(env, true).HOME).toBeUndefined();
    expect(buildBotmuxEnvAssignments(env, undefined, true)).toEqual(expect.arrayContaining([
      'HOME=/users/alice/home',
      'XDG_CONFIG_HOME=/users/alice/home/.config',
    ]));
  });
});
