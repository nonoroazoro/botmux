import { describe, expect, it } from 'vitest';

import { setIsolatedUserHome } from '../../src/core/multi-user-env.js';

describe('setIsolatedUserHome', () => {
  it('replaces host data paths and removes inherited Git and agent identities', () => {
    const env: NodeJS.ProcessEnv = {
      HOME: '/home/service',
      XDG_CONFIG_HOME: '/host/config',
      XDG_DATA_HOME: '/host/data',
      XDG_CACHE_HOME: '/host/cache',
      XDG_STATE_HOME: '/host/state',
      XDG_RUNTIME_DIR: '/run/user/1000',
      GIT_CONFIG_GLOBAL: '/host/gitconfig',
      SSH_AUTH_SOCK: '/host/agent.sock',
      PATH: '/usr/local/bin:/usr/bin',
      CODEX_HOME: '/users/alice/home/.codex',
    };

    setIsolatedUserHome(env, '/users/alice/home');

    expect(env).toEqual({
      HOME: '/users/alice/home',
      XDG_CONFIG_HOME: '/users/alice/home/.config',
      XDG_DATA_HOME: '/users/alice/home/.local/share',
      XDG_CACHE_HOME: '/users/alice/home/.cache',
      XDG_STATE_HOME: '/users/alice/home/.local/state',
      PATH: '/usr/local/bin:/usr/bin',
      CODEX_HOME: '/users/alice/home/.codex',
    });

    setIsolatedUserHome(env, '/data/users/alice/home');
    expect(env.XDG_DATA_HOME).toBe('/data/users/alice/home/.local/share');
    expect(env.XDG_STATE_HOME).toBe('/data/users/alice/home/.local/state');
  });
});
