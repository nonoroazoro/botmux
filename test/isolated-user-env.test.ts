import { describe, expect, it } from 'vitest';

import { buildBotmuxEnvAssignments } from '../src/adapters/backend/tmux-backend.js';
import { tmuxEnv } from '../src/setup/ensure-tmux.js';
import { zellijEnv } from '../src/setup/ensure-zellij.js';

describe('isolated user environment', () => {
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
