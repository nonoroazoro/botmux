import { homedir } from 'node:os';
import { join } from 'node:path';

import type { MultiUserIsolationConfig } from '../bot-registry.js';

export function createDefaultMultiUserIsolationConfig(larkAppId: string): MultiUserIsolationConfig {
  return {
    enabled: true,
    root: join(homedir(), 'BotmuxUsers', larkAppId),
    ownerOnlyTopics: true,
    sharedCodexHome: join(homedir(), '.codex'),
    defaultGitIdentity: {
      name: 'Finder Master',
      email: 'finder-master@botmux.local',
    },
  };
}
