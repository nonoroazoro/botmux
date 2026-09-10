import { homedir } from 'node:os';
import { join } from 'node:path';

import type { MultiUserIsolationConfig } from '../bot-registry.js';

export function createDefaultMultiUserIsolationConfig(larkAppId: string): MultiUserIsolationConfig {
  return {
    enabled: true,
    root: join(homedir(), 'AgentUsers', larkAppId),
    ownerOnlyTopics: true,
    sharedCodexHome: join(homedir(), '.codex'),
    defaultGitIdentity: {
      name: 'Agent',
      email: 'agent@users.invalid',
    },
  };
}
