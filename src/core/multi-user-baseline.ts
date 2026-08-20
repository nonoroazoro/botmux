import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { atomicWriteFileSync } from '../utils/atomic-write.js';

const MANIFEST_NAME = '.botmux-baseline.json';

interface BaselineManifest {
  links: Record<string, string>;
}

export interface MultiUserBaselineSyncResult {
  linked: string[];
  preserved: string[];
  removed: string[];
  readonlyRoots: string[];
}

function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function ensureContainedDirectory(targetRoot: string, targetDir: string): boolean {
  let canonicalRoot: string;
  try { canonicalRoot = realpathSync(targetRoot); } catch { return false; }
  const lexicalRoot = resolve(targetRoot);
  const lexicalTarget = resolve(targetDir);
  if (!isWithin(lexicalRoot, lexicalTarget)) return false;

  const rel = relative(lexicalRoot, lexicalTarget);
  let cursor = lexicalRoot;
  for (const part of rel.split(/[\\/]/u).filter(Boolean)) {
    cursor = join(cursor, part);
    try {
      const stat = lstatSync(cursor);
      if (stat.isSymbolicLink() || !stat.isDirectory()) return false;
    } catch {
      try { mkdirSync(cursor, { mode: 0o700 }); } catch { return false; }
    }
  }
  try { return isWithin(canonicalRoot, realpathSync(lexicalTarget)); } catch { return false; }
}

function readManifest(targetDir: string): BaselineManifest {
  try {
    const parsed = JSON.parse(readFileSync(join(targetDir, MANIFEST_NAME), 'utf8')) as BaselineManifest;
    if (parsed && typeof parsed === 'object' && parsed.links && typeof parsed.links === 'object') {
      return {
        links: Object.fromEntries(
          Object.entries(parsed.links).filter(([name, source]) =>
            typeof source === 'string'
            && name.length > 0
            && name !== '.'
            && name !== '..'
            && !name.includes('/')
            && !name.includes('\\')),
        ),
      };
    }
  } catch {
    // A missing or invalid marker means no entry is safe for botmux to remove.
  }
  return { links: {} };
}

function writeManifest(targetDir: string, manifest: BaselineManifest): void {
  atomicWriteFileSync(
    join(targetDir, MANIFEST_NAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600, followTargetSymlink: false },
  );
}

function assertSafeManifestPath(targetDir: string): void {
  const path = join(targetDir, MANIFEST_NAME);
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`Unsafe multi-user baseline marker: ${path}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function symlinkMatches(path: string, expected: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink()
      && resolve(dirname(path), readlinkSync(path)) === expected;
  } catch {
    return false;
  }
}

/**
 * Projects a host baseline directory into an isolated user's writable directory.
 * Each direct child is linked separately so a user-owned entry with the same name
 * wins over the host baseline. Only links recorded in the private marker are ever
 * updated or removed.
 */
export function syncMultiUserBaselineDirectory(
  sourceDir: string | readonly string[],
  targetDir: string,
  options: {
    includeFiles?: boolean;
    overrideDirs?: readonly string[];
    targetRoot?: string;
  } = {},
): MultiUserBaselineSyncResult {
  const result: MultiUserBaselineSyncResult = {
    linked: [],
    preserved: [],
    removed: [],
    readonlyRoots: [],
  };
  const canonicalSources: string[] = [];
  for (const source of typeof sourceDir === 'string' ? [sourceDir] : sourceDir) {
    if (!existsSync(source)) continue;
    try {
      const canonical = realpathSync(source);
      if (lstatSync(canonical).isDirectory() && !canonicalSources.includes(canonical)) {
        canonicalSources.push(canonical);
      }
    } catch {
      // A missing or unreadable source contributes no baseline entries.
    }
  }

  try {
    if (lstatSync(targetDir).isSymbolicLink()) {
      const current = resolve(dirname(targetDir), readlinkSync(targetDir));
      let canonicalCurrent = current;
      try { canonicalCurrent = realpathSync(targetDir); } catch { /* dangling link */ }
      if (!canonicalSources.includes(canonicalCurrent)) {
        result.preserved.push(targetDir);
        return result;
      }
      unlinkSync(targetDir);
    } else if (!lstatSync(targetDir).isDirectory()) {
      result.preserved.push(targetDir);
      return result;
    }
  } catch {
    // The target does not exist yet.
  }
  if (options.targetRoot) {
    if (!ensureContainedDirectory(options.targetRoot, targetDir)) {
      result.preserved.push(targetDir);
      return result;
    }
  } else {
    mkdirSync(targetDir, { recursive: true, mode: 0o700 });
  }
  assertSafeManifestPath(targetDir);

  const previous = readManifest(targetDir);
  const next: BaselineManifest = { links: {} };
  const sourceEntries = new Map<string, string>();
  const overrideNames = new Set<string>();
  for (const overrideDir of options.overrideDirs ?? []) {
    try {
      const canonicalOverride = realpathSync(overrideDir);
      if (options.targetRoot && !isWithin(realpathSync(options.targetRoot), canonicalOverride)) continue;
      if (!lstatSync(canonicalOverride).isDirectory()) continue;
      for (const entry of readdirSync(canonicalOverride, { withFileTypes: true })) {
        if (entry.name !== MANIFEST_NAME) overrideNames.add(entry.name);
      }
    } catch {
      // A missing or unsafe override directory contributes no names.
    }
  }
  for (const canonicalSource of canonicalSources) {
    const entries = readdirSync(canonicalSource, { withFileTypes: true })
      .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      if (entry.name === MANIFEST_NAME || sourceEntries.has(entry.name)) continue;
      if (!entry.isDirectory() && !entry.isSymbolicLink() && !(options.includeFiles && entry.isFile())) continue;
      const lexicalEntry = join(canonicalSource, entry.name);
      let canonicalEntry: string;
      try { canonicalEntry = realpathSync(lexicalEntry); } catch { continue; }
      // Keep the projected link pointed at the stable host entry. Package
      // managers commonly move that entry between versioned targets during an
      // upgrade. The canonical target is mounted read-only below, but must not
      // be persisted as the user's link target.
      sourceEntries.set(entry.name, lexicalEntry);
      if (canonicalEntry !== lexicalEntry) result.readonlyRoots.push(canonicalEntry);
    }
  }

  for (const [name, oldSource] of Object.entries(previous.links)) {
    if (sourceEntries.has(name)) continue;
    const target = join(targetDir, name);
    if (symlinkMatches(target, oldSource)) {
      unlinkSync(target);
      result.removed.push(name);
    }
  }

  for (const [name, source] of sourceEntries) {
    const target = join(targetDir, name);
    const oldSource = previous.links[name];
    if (overrideNames.has(name)) {
      if (oldSource && symlinkMatches(target, oldSource)) {
        unlinkSync(target);
        result.removed.push(name);
      }
      result.preserved.push(name);
      continue;
    }
    if (oldSource && symlinkMatches(target, oldSource) && oldSource !== source) {
      unlinkSync(target);
    }
    if (!existsSync(target)) {
      try {
        if (lstatSync(target).isSymbolicLink()) {
          result.preserved.push(name);
          continue;
        }
      } catch {
        // Missing target is the expected link creation path.
      }
      symlinkSync(source, target);
      result.linked.push(name);
      next.links[name] = source;
      continue;
    }
    if (symlinkMatches(target, source)) {
      next.links[name] = source;
    } else {
      result.preserved.push(name);
    }
  }

  writeManifest(targetDir, next);
  result.readonlyRoots.push(...canonicalSources);
  result.readonlyRoots = [...new Set(result.readonlyRoots)];
  return result;
}
