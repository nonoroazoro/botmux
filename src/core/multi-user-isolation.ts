import { createHash } from 'node:crypto';
import { chmodSync, lstatSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';

import type { MultiUserIsolationConfig } from '../bot-registry.js';
import { provisionMultiUserGitIdentity } from './multi-user-git-identity.js';

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

function ensurePrivateDirectory(path: string): void {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`multi-user isolation path must be a real directory: ${path}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    mkdirSync(path, { mode: 0o700 });
  }
  chmodSync(path, 0o700);
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
  ensurePrivateDirectory(resolve(homeDir, '.ssh'));
  const gitIdentity = input.config.defaultGitIdentity;
  if (gitIdentity) provisionMultiUserGitIdentity(homeDir, gitIdentity);

  const sharedCodexHome = input.config.sharedCodexHome
    ? resolve(expandHome(input.config.sharedCodexHome))
    : undefined;
  return { homeDir, workingDir, sharedCodexHome };
}
