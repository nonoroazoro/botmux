import { resetMemoryFs } from './helpers/memory-fs/index.js';
/**
 * Unit tests for command-discovery (filesystem slash-command discovery) and the
 * customPassthroughCommands normalization in parseBotConfigsFromText.
 *
 * Run:  pnpm vitest run test/command-discovery.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('node:fs', async () => (await import('./helpers/memory-fs/index.js')).fs);
vi.mock('node:fs/promises', async () => (await import('./helpers/memory-fs/index.js')).fs.promises);

beforeEach(() => {
  resetMemoryFs({
    '/fixtures/botmux-disc-1': null,
    '/fixtures/botmux-adapter-disc-2': null,
  });
});
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import {
  discoverSlashCommands,
  discoverSlashCommandsForAdapter,
  supportsFilesystemCommandDiscovery,
} from '../src/core/command-discovery.js';
import { parseBotConfigsFromText } from '../src/bot-registry.js';

function write(file: string, content: string): void {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, content);
}

describe('discoverSlashCommands', () => {
  let root: string;
  let claudeHome: string;
  const prevEnv = process.env.CLAUDE_CONFIG_DIR;

  beforeEach(() => {
    root = '/fixtures/botmux-disc-1';
    claudeHome = join(root, 'home', '.claude');
    // Point personal discovery at an isolated fake ~/.claude.
    process.env.CLAUDE_CONFIG_DIR = claudeHome;
  });

  afterEach(() => {
    if (prevEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = prevEnv;
    rmSync(root, { recursive: true, force: true });
  });

  it('finds project-level custom commands with frontmatter description', () => {
    const proj = join(root, 'proj');
    write(join(proj, '.claude', 'commands', 'deploy.md'), '---\ndescription: Ship it\n---\nbody');
    const found = discoverSlashCommands(proj);
    const deploy = found.find((c) => c.name === '/deploy');
    expect(deploy).toBeDefined();
    expect(deploy?.source).toBe('project-command');
    expect(deploy?.description).toBe('Ship it');
  });

  it('namespaces nested command subdirs with ":"', () => {
    const proj = join(root, 'proj');
    write(join(proj, '.claude', 'commands', 'git', 'sync.md'), 'no frontmatter');
    const found = discoverSlashCommands(proj);
    expect(found.some((c) => c.name === '/git:sync')).toBe(true);
  });

  it('finds personal skills via SKILL.md', () => {
    write(join(claudeHome, 'skills', 'lark-doc', 'SKILL.md'), '---\ndescription: Feishu docs\n---');
    const found = discoverSlashCommands(join(root, 'proj'));
    const skill = found.find((c) => c.name === '/lark-doc');
    expect(skill).toBeDefined();
    expect(skill?.source).toBe('user-skill');
    expect(skill?.description).toBe('Feishu docs');
  });

  it('namespaces plugin skills as /pluginId:name', () => {
    write(
      join(claudeHome, 'plugins', 'cache', 'mp', 'figma', '1.0.0', 'skills', 'figma-use', 'SKILL.md'),
      '---\ndescription: Use Figma\n---',
    );
    const found = discoverSlashCommands(join(root, 'proj'));
    expect(found.some((c) => c.name === '/figma:figma-use')).toBe(true);
  });

  it('returns empty when nothing is installed', () => {
    expect(discoverSlashCommands(join(root, 'empty'))).toEqual([]);
  });
});

describe('discoverSlashCommandsForAdapter', () => {
  let root: string;

  beforeEach(() => {
    root = '/fixtures/botmux-adapter-disc-2';
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('scans generic CLI skillsDir roots such as Codex ~/.codex/skills', () => {
    const skillsDir = join(root, 'codex', 'skills');
    write(join(skillsDir, 'botmux-send', 'SKILL.md'), '---\ndescription: Send to Lark\n---');

    const found = discoverSlashCommandsForAdapter(join(root, 'proj'), { skillsDir });

    expect(found).toEqual([
      expect.objectContaining({
        name: '/botmux-send',
        source: 'user-skill',
        description: 'Send to Lark',
      }),
    ]);
  });

  it('uses adapter claudeDataDir for Claude-family personal discovery and still includes project .claude', () => {
    const dataDir = join(root, 'seed-runtime');
    const proj = join(root, 'proj');
    write(join(dataDir, 'skills', 'global-skill', 'SKILL.md'), '---\ndescription: Global\n---');
    write(join(proj, '.claude', 'commands', 'deploy.md'), '---\ndescription: Deploy\n---');

    const found = discoverSlashCommandsForAdapter(proj, { claudeDataDir: dataDir });

    expect(found.map((c) => c.name).sort()).toEqual(['/deploy', '/global-skill']);
    expect(found.find((c) => c.name === '/deploy')?.source).toBe('project-command');
    expect(found.find((c) => c.name === '/global-skill')?.source).toBe('user-skill');
  });

  it('reports support only when an adapter declares filesystem roots', () => {
    expect(supportsFilesystemCommandDiscovery({ skillsDir: join(root, 'skills') })).toBe(true);
    expect(supportsFilesystemCommandDiscovery({ claudeDataDir: join(root, '.claude') })).toBe(true);
    expect(supportsFilesystemCommandDiscovery({ pluginDir: join(root, 'plugin') })).toBe(true);
    expect(supportsFilesystemCommandDiscovery({})).toBe(false);
  });
});

describe('parseBotConfigsFromText · customPassthroughCommands', () => {
  const base = { larkAppId: 'cli_x', larkAppSecret: 's' };

  it('normalizes: lowercases, prepends "/", dedupes', () => {
    const [cfg] = parseBotConfigsFromText(
      JSON.stringify([{ ...base, customPassthroughCommands: ['Status', '/export', 'status'] }]),
    );
    expect(cfg.customPassthroughCommands).toEqual(['/status', '/export']);
  });

  it('drops malformed entries (spaces, bad chars, non-strings)', () => {
    const [cfg] = parseBotConfigsFromText(
      JSON.stringify([{ ...base, customPassthroughCommands: ['/ok-cmd', '/bad cmd', '/!nope', 42, '/UPPER:lower'] }]),
    );
    expect(cfg.customPassthroughCommands).toEqual(['/ok-cmd', '/upper:lower']);
  });

  it('is undefined when unset or all-invalid', () => {
    const [a] = parseBotConfigsFromText(JSON.stringify([{ ...base }]));
    expect(a.customPassthroughCommands).toBeUndefined();
    const [b] = parseBotConfigsFromText(JSON.stringify([{ ...base, customPassthroughCommands: ['  ', '/!@#'] }]));
    expect(b.customPassthroughCommands).toBeUndefined();
  });
});
