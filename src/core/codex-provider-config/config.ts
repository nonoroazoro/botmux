import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, unlinkSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import {
  parse,
  stringify,
  type TomlTable,
  type TomlValue,
} from 'smol-toml';
import { atomicWriteFileSync } from '../../utils/atomic-write.js';
import { withFileLockSync } from '../../utils/file-lock.js';
import { syncMultiUserBaselineDirectory } from '../multi-user-baseline.js';

function isTable(value: TomlValue | undefined): value is TomlTable {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function installedMarketplacePath(sharedCodexHome: string, name: string): string | undefined {
  const path = join(sharedCodexHome, '.tmp', 'marketplaces', name);
  try {
    return lstatSync(realpathSync(path)).isDirectory() ? path : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Seed principal config from provider defaults without copying project trust.
 */
export function seedCodexPrincipalConfig(source: string): string {
  const parsed = parse(source, { integersAsBigInt: 'asNeeded' });
  delete parsed.projects;
  return stringify(parsed);
}

function addReadonlyRoot(roots: Set<string>, path: string): void {
  if (!isAbsolute(path) || !existsSync(path)) return;
  roots.add(path);
  try { roots.add(realpathSync(path)); } catch { /* The lexical path remains useful to the sandbox. */ }
}

/**
 * Mirror the deployment-owned Codex credential into one private runtime home.
 * Removing the provider credential revokes it for that principal on cold spawn.
 *
 * @param sharedCodexHome Deployment-owned Codex home.
 * @param isolatedCodexHome Principal-owned Codex runtime home.
 */
export function syncCodexProviderCredential(
  sharedCodexHome: string,
  isolatedCodexHome: string,
): boolean {
  if (!isAbsolute(sharedCodexHome) || !isAbsolute(isolatedCodexHome)) {
    throw new Error('Codex provider and principal homes must be absolute');
  }
  mkdirSync(isolatedCodexHome, { recursive: true, mode: 0o700 });
  const sourcePath = join(sharedCodexHome, 'auth.json');
  const targetPath = join(isolatedCodexHome, 'auth.json');
  if (!existsSync(sourcePath)) {
    const target = lstatSync(targetPath, { throwIfNoEntry: false });
    if (!target) return false;
    if (target.isDirectory()) {
      throw new Error(`Codex principal credential path must not be a directory: ${targetPath}`);
    }
    unlinkSync(targetPath);
    return true;
  }

  const raw = readFileSync(sourcePath, 'utf8');
  const body = raw.endsWith('\n') ? raw : `${raw}\n`;
  const target = lstatSync(targetPath, { throwIfNoEntry: false });
  if (target?.isFile()
    && (target.mode & 0o777) === 0o600
    && readFileSync(targetPath, 'utf8').trim() === raw.trim()) return false;
  atomicWriteFileSync(targetPath, body, {
    mode: 0o600,
    durable: true,
    followTargetSymlink: false,
  });
  return true;
}

function projectMarketplaces(
  value: TomlValue | undefined,
  sharedCodexHome: string,
  readonlyRoots: Set<string>,
): TomlTable | undefined {
  if (!isTable(value)) return undefined;
  const projected: TomlTable = {};
  for (const [name, rawMarketplace] of Object.entries(value)) {
    if (!isTable(rawMarketplace)) continue;
    const marketplace: TomlTable = { ...rawMarketplace };
    const installedPath = rawMarketplace.source_type === 'git'
      ? installedMarketplacePath(sharedCodexHome, name)
      : undefined;
    if (installedPath) {
      // The shared checkout is a provider-owned capability source. Codex still
      // materializes its cache and plugin data below the principal's CODEX_HOME.
      marketplace.source_type = 'local';
      marketplace.source = installedPath;
      delete marketplace.ref;
      delete marketplace.sparse_paths;
      delete marketplace.last_updated;
      delete marketplace.last_revision;
    }
    if (marketplace.source_type === 'local' && typeof marketplace.source === 'string') {
      marketplace.source = resolve(sharedCodexHome, marketplace.source);
      // Linux binds canonical paths into a fresh root. A lexical alias such as
      // /home/user -> /data/home/user does not exist inside that sandbox.
      if (existsSync(marketplace.source)) marketplace.source = realpathSync(marketplace.source);
      addReadonlyRoot(readonlyRoots, marketplace.source);
    }
    projected[name] = marketplace;
  }
  return Object.keys(projected).length > 0 ? projected : undefined;
}

/**
 * Compose provider settings and principal-owned state for Codex's native config
 * loader. Both the TUI and app-server read this file without extra launch flags.
 *
 * @param source Provider config; its project trust is never inherited.
 * @param principal Existing private config; only runtime-owned fields survive.
 * @param sharedCodexHome Base directory for provider marketplace sources.
 * @param isolatedCodexHome Private database and log destination.
 */
export function compileCodexProviderConfig(
  source: string,
  principal: string,
  sharedCodexHome: string,
  isolatedCodexHome: string,
): { content: string; readonlyRoots: string[] } {
  const parsed = parse(source, { integersAsBigInt: 'asNeeded' });
  const privateConfig = parse(principal, { integersAsBigInt: 'asNeeded' });
  // Operator settings are authoritative, including deletions. Merging the old
  // provider copy would otherwise keep removed plugins and MCP servers enabled.
  for (const key of ['projects', 'notice']) {
    delete parsed[key];
    if (privateConfig[key] !== undefined) parsed[key] = privateConfig[key];
  }
  // Absolute paths copied from the provider must not redirect runtime writes
  // back into its shared home. These are Codex's default private locations.
  parsed.sqlite_home = isolatedCodexHome;
  parsed.log_dir = join(isolatedCodexHome, 'log');
  const readonlyRoots = new Set<string>();
  const marketplaces = projectMarketplaces(parsed.marketplaces, sharedCodexHome, readonlyRoots);
  if (marketplaces) parsed.marketplaces = marketplaces;
  return {
    content: `# Provider settings refresh on cold spawn; project trust and notices remain private.\n${stringify(parsed)}`,
    readonlyRoots: [...readonlyRoots],
  };
}

/**
 * Refresh a private native config without touching sessions, history or SQLite.
 * Use the same advisory lock as Botmux's workspace trust writer. Malformed
 * source or destination TOML fails before any existing config is replaced.
 *
 * @param sharedCodexHome Deployment-owned credentials, configuration and plugin code.
 * @param isolatedCodexHome Principal-owned Codex runtime directory.
 */
export function provisionCodexProviderConfig(
  sharedCodexHome: string,
  isolatedCodexHome: string,
) {
  if (!isAbsolute(sharedCodexHome) || !isAbsolute(isolatedCodexHome)) {
    throw new Error('Codex provider and principal homes must be absolute');
  }
  mkdirSync(isolatedCodexHome, { recursive: true, mode: 0o700 });
  const privateHome = realpathSync(isolatedCodexHome);
  if (existsSync(sharedCodexHome) && realpathSync(sharedCodexHome) === privateHome) {
    throw new Error('Codex principal home must differ from the provider home');
  }
  const sourcePath = join(sharedCodexHome, 'config.toml');
  const configPath = join(privateHome, 'config.toml');
  const source = existsSync(sourcePath) ? readFileSync(sourcePath, 'utf8') : '';
  return withFileLockSync(configPath, () => {
    // Do not import another home's trust through a preexisting symlink. The
    // atomic writer replaces the leaf itself, never its external target.
    const regular = existsSync(configPath) && lstatSync(configPath).isFile();
    const previous = regular ? readFileSync(configPath, 'utf8') : '';
    const compiled = compileCodexProviderConfig(source, previous, sharedCodexHome, privateHome);
    // enabled=true does not install a Codex plugin. Its versioned code cache
    // must also be visible; runtime plugin state stays outside this directory.
    const cache = syncMultiUserBaselineDirectory(
      join(sharedCodexHome, 'plugins/cache'),
      join(privateHome, 'plugins/cache'),
      { targetRoot: privateHome, replaceCacheEntries: true },
    );
    if (cache.preserved.length) {
      throw new Error('Could not project the provider plugin cache into the private Codex home');
    }
    const changed = previous !== compiled.content;
    if (changed) {
      atomicWriteFileSync(configPath, compiled.content, { mode: 0o600, followTargetSymlink: false });
    }
    return { configPath, changed, readonlyRoots: [...new Set([...compiled.readonlyRoots, ...cache.readonlyRoots])] };
  }, { maxWaitMs: 3_000 });
}
