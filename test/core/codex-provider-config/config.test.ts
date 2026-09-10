import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, lstatSync, readFileSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { parse } from 'smol-toml';
import { resetMemoryFs } from '../../helpers/memory-fs/index.js';
import {
  provisionCodexProviderConfig,
  seedCodexPrincipalConfig,
  syncCodexProviderCredential,
} from '../../../src/core/codex-provider-config/index.js';

vi.mock('node:fs', async () => (await import('../../helpers/memory-fs/index.js')).fs);
vi.mock('node:fs/promises', async () => (await import('../../helpers/memory-fs/index.js')).fs.promises);

const provider = '/fixtures/provider';
const userA = '/fixtures/alice/.codex';
const userB = '/fixtures/bob/.codex';

beforeEach(() => {
  resetMemoryFs({
    [`${provider}/config.toml`]: `
model = "provider-model"
sqlite_home = "/provider/database"
log_dir = "/provider/logs"
[projects."/provider/repo"]
trust_level = "trusted"
[features]
plugins = true
js_repl = true
[mcp_servers.shared]
command = "shared-tool"
[plugins."review@team"]
enabled = true
[marketplaces.team]
source_type = "git"
source = "https://example.com/team.git"
ref = "main"
`,
    [`${provider}/.tmp/marketplaces/team`]: null,
    [userA]: null,
    [userB]: null,
  });
});

describe('Codex provider configuration', () => {
  it('mirrors the provider credential and revokes a stale private copy when it is removed', () => {
    writeFileSync(`${provider}/auth.json`, '{"account":"shared"}');
    expect(syncCodexProviderCredential(provider, userA)).toBe(true);
    expect(readFileSync(`${userA}/auth.json`, 'utf8')).toBe('{"account":"shared"}\n');
    expect(statSync(`${userA}/auth.json`).mode & 0o777).toBe(0o600);
    expect(syncCodexProviderCredential(provider, userA)).toBe(false);

    unlinkSync(`${provider}/auth.json`);
    expect(syncCodexProviderCredential(provider, userA)).toBe(true);
    expect(existsSync(`${userA}/auth.json`)).toBe(false);
  });

  it('replaces a redirected private credential without modifying its target', () => {
    writeFileSync(`${provider}/auth.json`, '{"account":"shared"}');
    writeFileSync(`${userB}/outside-auth.json`, '{"account":"other"}');
    symlinkSync(`${userB}/outside-auth.json`, `${userA}/auth.json`);

    syncCodexProviderCredential(provider, userA);

    expect(lstatSync(`${userA}/auth.json`).isSymbolicLink()).toBe(false);
    expect(readFileSync(`${userA}/auth.json`, 'utf8')).toBe('{"account":"shared"}\n');
    expect(readFileSync(`${userB}/outside-auth.json`, 'utf8')).toBe('{"account":"other"}');
  });

  it('refreshes native config for both principals without copying trust or sharing runtime paths', () => {
    writeFileSync(`${userA}/config.toml`, `
model = "old-model"
[projects."/alice/repo"]
trust_level = "trusted"
[notice]
hide_full_access_warning = true
`);
    const originalProvider = readFileSync(`${provider}/config.toml`, 'utf8');
    for (const home of [userA, userB]) {
      const result = provisionCodexProviderConfig(provider, home);
      const config = parse(readFileSync(result.configPath, 'utf8'));
      expect(config.model).toBe('provider-model');
      expect(config.features).toEqual({ plugins: true, js_repl: true });
      expect(config.mcp_servers).toEqual({ shared: { command: 'shared-tool' } });
      expect(config.plugins).toEqual({ 'review@team': { enabled: true } });
      expect(config.marketplaces).toEqual({ team: {
        source_type: 'local', source: `${provider}/.tmp/marketplaces/team`,
      } });
      expect(config.sqlite_home).toBe(home);
      expect(config.log_dir).toBe(`${home}/log`);
      expect(config.projects).toEqual(home === userA ? { '/alice/repo': { trust_level: 'trusted' } } : undefined);
      expect(config.notice).toEqual(home === userA ? { hide_full_access_warning: true } : undefined);
      expect(result.readonlyRoots).toContain(`${provider}/.tmp/marketplaces/team`);
      expect(statSync(result.configPath).mode & 0o777).toBe(0o600);
    }
    expect(readFileSync(`${provider}/config.toml`, 'utf8')).toBe(originalProvider);
  });

  it('removes stale plugins and MCPs while leaving sessions, auth, history and DB bytes untouched', () => {
    resetMemoryFs({
      [`${provider}/config.toml`]: '[plugins."new@team"]\nenabled = true\n',
      [`${userA}/config.toml`]: '[plugins."old@team"]\nenabled = true\n[mcp_servers.old]\ncommand = "old-tool"\n',
      [`${userA}/auth.json`]: '{"account":"shared"}',
      [`${userA}/history.jsonl`]: '{"text":"private history"}\n',
      [`${userA}/sessions/turn.jsonl`]: '{"text":"private turn"}\n',
      [`${userA}/state_5.sqlite`]: Buffer.from([0, 1, 2, 255]),
    });
    const paths = ['auth.json', 'history.jsonl', 'sessions/turn.jsonl', 'state_5.sqlite'];
    const previous = paths.map(path => readFileSync(`${userA}/${path}`));
    provisionCodexProviderConfig(provider, userA);
    expect(parse(readFileSync(`${userA}/config.toml`, 'utf8')).plugins).toEqual({ 'new@team': { enabled: true } });
    writeFileSync(`${provider}/config.toml`, 'model = "changed"\n');
    provisionCodexProviderConfig(provider, userA);
    const refreshed = parse(readFileSync(`${userA}/config.toml`, 'utf8'));
    expect(refreshed.plugins).toBeUndefined();
    expect(refreshed.mcp_servers).toBeUndefined();
    expect(refreshed.model).toBe('changed');
    expect(paths.map(path => readFileSync(`${userA}/${path}`))).toEqual(previous);
  });

  it('does not rewrite an unchanged config and preserves trust added between spawns', () => {
    provisionCodexProviderConfig(provider, userA);
    expect(provisionCodexProviderConfig(provider, userA).changed).toBe(false);
    writeFileSync(`${userA}/config.toml`, readFileSync(`${userA}/config.toml`, 'utf8')
      + '\n[projects."/alice/new"]\ntrust_level = "trusted"\n');
    provisionCodexProviderConfig(provider, userA);
    expect(parse(readFileSync(`${userA}/config.toml`, 'utf8')).projects)
      .toEqual({ '/alice/new': { trust_level: 'trusted' } });
  });

  it('replaces obsolete private code caches while preserving plugin runtime data', () => {
    resetMemoryFs({
      [`${provider}/config.toml`]: '[plugins."review@team"]\nenabled = true\n',
      [`${provider}/plugins/cache/team/review/2.0.0/README.md`]: 'new code',
      [`${userA}/plugins/cache/team/review/1.0.0/README.md`]: 'old code',
      [`${userA}/plugins/data/review.json`]: '{"private":true}',
    });
    const result = provisionCodexProviderConfig(provider, userA);
    expect(lstatSync(`${userA}/plugins/cache/team`).isSymbolicLink()).toBe(true);
    expect(readFileSync(`${userA}/plugins/cache/team/review/2.0.0/README.md`, 'utf8')).toBe('new code');
    expect(readFileSync(`${userA}/plugins/data/review.json`, 'utf8')).toBe('{"private":true}');
    expect(result.readonlyRoots).toContain(`${provider}/plugins/cache`);
  });

  it('rejects a redirected cache parent without touching the other principal', () => {
    resetMemoryFs({
      [`${provider}/config.toml`]: 'model = "new"\n',
      [`${userA}/config.toml`]: 'model = "old"\n',
      [`${userB}/plugins/cache/team/private.txt`]: 'private',
    });
    symlinkSync(`${userB}/plugins`, `${userA}/plugins`);
    expect(() => provisionCodexProviderConfig(provider, userA)).toThrow('Could not project');
    expect(readFileSync(`${userA}/config.toml`, 'utf8')).toBe('model = "old"\n');
    expect(readFileSync(`${userB}/plugins/cache/team/private.txt`, 'utf8')).toBe('private');
  });

  it.each(['provider', 'principal'])('leaves existing config untouched on malformed %s TOML', (side) => {
    writeFileSync(`${userA}/config.toml`, side === 'principal' ? '[broken' : 'model = "old"\n');
    if (side === 'provider') writeFileSync(`${provider}/config.toml`, '[broken');
    const previous = readFileSync(`${userA}/config.toml`, 'utf8');
    expect(() => provisionCodexProviderConfig(provider, userA)).toThrow();
    expect(readFileSync(`${userA}/config.toml`, 'utf8')).toBe(previous);
    expect(existsSync(`${userA}/config.toml.lock`)).toBe(false);
  });

  it('replaces a config symlink without importing external trust or modifying its target', () => {
    symlinkSync(`${provider}/config.toml`, `${userA}/config.toml`);
    const original = readFileSync(`${provider}/config.toml`, 'utf8');
    provisionCodexProviderConfig(provider, userA);
    expect(lstatSync(`${userA}/config.toml`).isSymbolicLink()).toBe(false);
    expect(parse(readFileSync(`${userA}/config.toml`, 'utf8')).projects).toBeUndefined();
    expect(readFileSync(`${provider}/config.toml`, 'utf8')).toBe(original);
    expect(() => provisionCodexProviderConfig(provider, provider)).toThrow('must differ');
  });

  it('keeps uninstalled Git sources and resolves local sources relative to the provider config', () => {
    writeFileSync(`${provider}/config.toml`, `
[marketplaces.remote]
source_type = "git"
source = "https://example.com/remote.git"
ref = "release"
[marketplaces.local]
source_type = "local"
source = ".tmp/marketplaces/team"
`);
    provisionCodexProviderConfig(provider, userA);
    expect(parse(readFileSync(`${userA}/config.toml`, 'utf8')).marketplaces).toEqual({
      remote: { source_type: 'git', source: 'https://example.com/remote.git', ref: 'release' },
      local: { source_type: 'local', source: `${provider}/.tmp/marketplaces/team` },
    });
  });

  it('does not seed operator project trust for legacy single-bot isolation', () => {
    expect(parse(seedCodexPrincipalConfig(readFileSync(`${provider}/config.toml`, 'utf8'))).projects).toBeUndefined();
  });

  it('uses canonical marketplace paths that remain visible in the sandbox', () => {
    symlinkSync(provider, '/fixtures/provider-alias');
    const result = provisionCodexProviderConfig('/fixtures/provider-alias', userA);
    expect(parse(readFileSync(result.configPath, 'utf8')).marketplaces).toEqual({
      team: { source_type: 'local', source: `${provider}/.tmp/marketplaces/team` },
    });
    writeFileSync(`${provider}/config.toml`, '[marketplaces.team]\nsource_type = "local"\nsource = "/fixtures/provider-alias/.tmp/marketplaces/team"\n');
    provisionCodexProviderConfig(provider, userA);
    expect(parse(readFileSync(result.configPath, 'utf8')).marketplaces).toEqual({
      team: { source_type: 'local', source: `${provider}/.tmp/marketplaces/team` },
    });
  });
});
