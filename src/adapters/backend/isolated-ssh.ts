import { isAbsolute, resolve, sep } from 'node:path';

/**
 * Mount one principal's SSH directory at the native OpenSSH home path.
 * OpenSSH resolves ~/.ssh through getpwuid(3), which does not follow HOME.
 */
export function isolatedSshMountArgs(
  sourceDir: string,
  nativeHomeDir: string,
): string[] {
  if (!isAbsolute(sourceDir) || !isAbsolute(nativeHomeDir)) {
    throw new Error('isolated SSH paths must be absolute');
  }
  const source = resolve(sourceDir);
  const nativeHome = resolve(nativeHomeDir);
  if (source === '/' || nativeHome === '/') {
    throw new Error('isolated SSH paths cannot use the filesystem root');
  }

  const args: string[] = [];
  let cursor = '';
  for (const part of nativeHome.split(sep).filter(Boolean)) {
    cursor = `${cursor}${sep}${part}`;
    args.push('--dir', cursor);
  }
  args.push('--bind', source, `${nativeHome}${sep}.ssh`);
  return args;
}
