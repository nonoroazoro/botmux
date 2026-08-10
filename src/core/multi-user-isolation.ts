import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';

import type { MultiUserIsolationConfig } from '../bot-registry.js';

export interface MultiUserSessionPaths {
  homeDir: string;
  workingDir: string;
  sharedCodexHome?: string;
}

function expandHome(path: string): string {
  return path.replace(/^~(?=\/|$)/u, homedir());
}

function isWithin(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function resolveMultiUserSessionPaths(input: {
  config: MultiUserIsolationConfig;
  principalOpenId: string;
  requestedWorkingDir: string;
  defaultWorkingDir?: string;
}): MultiUserSessionPaths {
  const expandedRoot = expandHome(input.config.root);
  if (!isAbsolute(expandedRoot)) {
    throw new Error(`multiUserIsolation.root must be absolute: ${input.config.root}`);
  }
  const root = resolve(expandedRoot);
  if (root === '/') {
    throw new Error(`multiUserIsolation.root must be an absolute non-root path: ${input.config.root}`);
  }

  const principalId = createHash('sha256')
    .update(input.principalOpenId, 'utf8')
    .digest('hex')
    .slice(0, 32);
  const principalRoot = resolve(root, principalId);
  const homeDir = resolve(principalRoot, 'home');
  const workspaceDir = resolve(principalRoot, 'workspace');
  const requested = resolve(expandHome(input.requestedWorkingDir));
  const defaultWorkingDir = input.defaultWorkingDir
    ? resolve(expandHome(input.defaultWorkingDir))
    : undefined;

  let workingDir: string;
  if (isWithin(workspaceDir, requested)) {
    workingDir = requested;
  } else if (defaultWorkingDir && isWithin(defaultWorkingDir, requested)) {
    workingDir = resolve(workspaceDir, relative(defaultWorkingDir, requested));
  } else if (requested === resolve(homedir())) {
    workingDir = workspaceDir;
  } else {
    throw new Error(
      `working directory ${requested} is outside the isolated workspace ${workspaceDir}`,
    );
  }

  for (const path of [root, principalRoot, homeDir, workspaceDir, workingDir]) {
    mkdirSync(path, { recursive: true, mode: 0o700 });
    chmodSync(path, 0o700);
  }
  const gitIdentity = input.config.defaultGitIdentity;
  const gitConfigPath = resolve(homeDir, '.gitconfig');
  if (gitIdentity && !existsSync(gitConfigPath)) {
    if (/\r|\n/u.test(gitIdentity.name) || /\r|\n/u.test(gitIdentity.email)) {
      throw new Error('multiUserIsolation.defaultGitIdentity cannot contain newlines');
    }
    const body = `[user]\n\tname = ${gitIdentity.name}\n\temail = ${gitIdentity.email}\n`;
    writeFileSync(gitConfigPath, body, { mode: 0o600 });
  }

  const sharedCodexHome = input.config.sharedCodexHome
    ? resolve(expandHome(input.config.sharedCodexHome))
    : undefined;
  return { homeDir, workingDir, sharedCodexHome };
}
