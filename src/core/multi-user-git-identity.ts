import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

import { atomicWriteFileSync } from '../utils/atomic-write.js';

const GIT_FALLBACK_CONFIG_NAME = '.botmux-gitconfig';

function resolveSystemGitConfigPath(): string | undefined {
  const env = { ...process.env };
  for (const key of [
    'GIT_CONFIG',
    'GIT_CONFIG_COUNT',
    'GIT_CONFIG_NOSYSTEM',
    'GIT_CONFIG_PARAMETERS',
    'GIT_CONFIG_SYSTEM',
  ]) delete env[key];
  try {
    const output = execFileSync(
      'git',
      ['config', '--system', '--show-origin', '--list'],
      { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    for (const line of output.split('\n')) {
      const separator = line.indexOf('\t');
      const origin = separator >= 0 ? line.slice(0, separator) : line;
      if (origin.startsWith('file:')) return origin.slice('file:'.length);
    }
  } catch { /* Missing or empty system config. */ }
  return existsSync('/etc/gitconfig') ? '/etc/gitconfig' : undefined;
}

function fallbackConfig(identity: { name: string; email: string }): string {
  const systemConfig = resolveSystemGitConfigPath();
  const inheritedSystem = systemConfig
    ? `[include]\n\tpath = ${JSON.stringify(systemConfig)}\n`
    : '';
  return `${inheritedSystem}[user]\n\tname = ${JSON.stringify(identity.name)}\n\temail = ${JSON.stringify(identity.email)}\n`;
}

function legacyConfig(identity: { name: string; email: string }): string {
  return `[user]\n\tname = ${identity.name}\n\temail = ${identity.email}\n`;
}

/** Absolute path of the generated Git fallback inside one isolated home. */
export function multiUserGitFallbackPath(homeDir: string): string {
  return resolve(homeDir, GIT_FALLBACK_CONFIG_NAME);
}

/** Provision the bot identity as Git's lowest-priority configuration layer. */
export function provisionMultiUserGitIdentity(
  homeDir: string,
  identity: { name: string; email: string },
): void {
  if (/\r|\n/u.test(identity.name) || /\r|\n/u.test(identity.email)) {
    throw new Error('multiUserIsolation.defaultGitIdentity cannot contain newlines');
  }
  atomicWriteFileSync(
    multiUserGitFallbackPath(homeDir),
    fallbackConfig(identity),
    { mode: 0o600, followTargetSymlink: false },
  );

  const gitConfigPath = resolve(homeDir, '.gitconfig');
  try {
    const stat = lstatSync(gitConfigPath);
    if (!stat.isFile() || stat.isSymbolicLink()) return;
    if (readFileSync(gitConfigPath, 'utf8') === legacyConfig(identity)) {
      unlinkSync(gitConfigPath);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
