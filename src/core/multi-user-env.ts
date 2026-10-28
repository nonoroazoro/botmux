import { join } from 'node:path';

import { ISOLATED_USER_ENV_KEYS } from '../utils/child-env.js';

/**
 * Assign a principal's home and standard data directories after clearing host
 * identity overrides. An inherited runtime socket directory is never shared.
 *
 * @param env Child environment to update
 * @param homeDir Principal home, canonicalized when used inside a sandbox
 */
export function setIsolatedUserHome(env: NodeJS.ProcessEnv, homeDir: string): void {
  for (const key of ISOLATED_USER_ENV_KEYS) delete env[key];
  env.HOME = homeDir;
  env.XDG_CONFIG_HOME = join(homeDir, '.config');
  env.XDG_DATA_HOME = join(homeDir, '.local', 'share');
  env.XDG_CACHE_HOME = join(homeDir, '.cache');
  env.XDG_STATE_HOME = join(homeDir, '.local', 'state');
}
