import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { afterAll, describe, expect, it } from 'vitest';
import { provisionCodexProviderConfig } from '../../../src/core/codex-provider-config/index.js';
import { syncMultiUserBaselineDirectory } from '../../../src/core/multi-user-baseline.js';

// Opt-in contract check against an existing Codex binary. No Botmux daemon,
// provider credentials, model requests, or global configuration are used.
const binary = process.env.BOTMUX_CODEX_TEST_BIN;
const root = join(tmpdir(), 'codex-provider-contract');

function write(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

async function inspectCodex(home: string, cwd: string) {
  const child = spawn(binary!, ['app-server', '--listen', 'stdio://'], {
    cwd,
    env: {
      PATH: process.env.PATH,
      HOME: dirname(home),
      CODEX_HOME: home,
      TMPDIR: tmpdir(),
      XDG_CONFIG_HOME: join(dirname(home), '.config'),
      XDG_CACHE_HOME: join(dirname(home), '.cache'),
      XDG_DATA_HOME: join(dirname(home), '.local/share'),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let sequence = 0;
  let stderr = '';
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  const lines = createInterface({ input: child.stdout });
  const exited = new Promise<void>(resolve => child.once('close', () => resolve()));
  child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-4000); });
  const rejectPending = (error: Error) => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  child.on('error', rejectPending);
  child.on('exit', () => rejectPending(new Error(`Codex exited: ${stderr}`)));
  lines.on('line', line => {
    const message = JSON.parse(line);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  const request = async (method: string, params: unknown): Promise<any> => {
    const id = ++sequence;
    let timer: ReturnType<typeof setTimeout>;
    try {
      return await Promise.race([
        new Promise((resolve, reject) => {
          pending.set(id, { resolve, reject });
          child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
        }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Codex ${method} timed out: ${stderr}`)), 10_000);
        }),
      ]);
    } finally {
      clearTimeout(timer!);
      pending.delete(id);
    }
  };
  try {
    await request('initialize', { clientInfo: { name: 'provider-contract', version: '1' }, capabilities: { experimentalApi: true } });
    child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
    const config = await request('config/read', { includeLayers: false });
    const skills = await request('skills/list', { cwds: [cwd], forceReload: true });
    const plugins = await request('plugin/list', { cwds: [cwd] });
    const marketplace = plugins.marketplaces.find((entry: any) => entry.name === 'contract');
    const plugin = marketplace
      ? await request('plugin/read', { marketplacePath: marketplace.path, pluginName: 'review' })
      : undefined;
    return { config, skills, plugins, plugin };
  } finally {
    lines.close();
    child.kill('SIGTERM');
    const killTimer = setTimeout(() => child.kill('SIGKILL'), 2_000);
    await exited;
    clearTimeout(killTimer);
  }
}

afterAll(() => { rmSync(root, { recursive: true, force: true }); });

describe.skipIf(!binary)('native Codex provider reuse', () => {
  it('loads shared plugins and skills for two private homes and applies provider removal on restart', async () => {
    const provider = join(root, 'provider');
    const marketplace = join(provider, '.tmp/marketplaces/contract');
    write(join(marketplace, '.agents/plugins/marketplace.json'), JSON.stringify({
      name: 'contract',
      plugins: [{ name: 'review', source: { source: 'local', path: './plugins/review' },
        policy: { installation: 'AVAILABLE', authentication: 'ON_USE' }, category: 'Productivity' }],
    }));
    write(join(marketplace, 'plugins/review/.codex-plugin/plugin.json'), JSON.stringify({
      name: 'review', version: '1.0.0', description: 'Offline provider contract fixture', skills: './skills', mcpServers: './.mcp.json',
    }));
    write(join(marketplace, 'plugins/review/.mcp.json'), JSON.stringify({
      mcpServers: { 'contract-mcp': { command: process.execPath, args: ['-e', 'process.exit(0)'] } },
    }));
    write(join(marketplace, 'plugins/review/skills/contract-review/SKILL.md'),
      '---\nname: contract-review\ndescription: Offline review fixture\n---\nReview the requested code.\n');
    write(join(provider, 'skills/contract-global/SKILL.md'),
      '---\nname: contract-global\ndescription: Offline global fixture\n---\nRead the requested file.\n');
    const source = `
check_for_update_on_startup = false
[features]
plugins = true
[marketplaces.contract]
source_type = "local"
source = ${JSON.stringify(marketplace)}
[plugins."review@contract"]
enabled = true
`;
    write(join(provider, 'config.toml'), source);
    // Let the real CLI create its native installed-cache layout in the fixture
    // provider home instead of reproducing private Codex installation metadata.
    const install = spawnSync(binary!, ['plugin', 'add', 'review@contract', '--json'], {
      cwd: root,
      env: { PATH: process.env.PATH, HOME: root, CODEX_HOME: provider, TMPDIR: tmpdir() },
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect(install.status, install.stderr).toBe(0);
    const installedProvider = readFileSync(join(provider, 'config.toml'), 'utf8');
    const homes = ['alice', 'bob'].map(user => join(root, user, '.codex'));
    for (const [index, home] of homes.entries()) {
      const cwd = join(dirname(home), 'workspace');
      write(join(home, 'config.toml'), `[projects.${JSON.stringify(cwd)}]\ntrust_level = "trusted"\n`);
      write(join(cwd, 'private.txt'), `private-${index}`);
      write(join(home, 'history.jsonl'), `{"text":"private-${index}"}\n`);
      provisionCodexProviderConfig(provider, home);
      syncMultiUserBaselineDirectory(join(provider, 'skills'), join(home, 'skills'), { targetRoot: dirname(home) });
      const result = await inspectCodex(home, cwd);
      expect(result.config.config.plugins['review@contract'].enabled).toBe(true);
      expect(result.config.config.sqlite_home).toBe(home);
      expect(result.config.config.projects).toEqual({ [cwd]: { trust_level: 'trusted' } });
      const skills = result.skills.data.flatMap((entry: any) => entry.skills);
      expect(skills.map((skill: any) => skill.name)).toContain('contract-global');
      expect(skills).toContainEqual(expect.objectContaining({
        name: 'review:contract-review',
        path: join(provider, 'plugins/cache/contract/review/1.0.0/skills/contract-review/SKILL.md'),
      }));
      expect(result.plugins.marketplaces[0].plugins[0]).toMatchObject({ installed: true, enabled: true });
      expect(JSON.stringify(result.plugin)).toContain('contract-mcp');
      expect(readFileSync(join(home, 'history.jsonl'), 'utf8')).toBe(`{"text":"private-${index}"}\n`);
    }
    expect(readFileSync(join(provider, 'config.toml'), 'utf8')).toBe(installedProvider);
    write(join(provider, 'config.toml'), 'check_for_update_on_startup = false\n');
    for (const home of homes) {
      provisionCodexProviderConfig(provider, home);
      const result = await inspectCodex(home, join(dirname(home), 'workspace'));
      expect(result.config.config.plugins?.['review@contract']?.enabled).not.toBe(true);
      const skills = result.skills.data.flatMap((entry: any) => entry.skills);
      expect(skills.map((skill: any) => skill.name)).not.toContain('review:contract-review');
    }
  }, 60_000);
});
