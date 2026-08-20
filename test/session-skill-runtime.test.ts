import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { prepareSessionSkillPrompt } from '../src/core/skills/session-runtime.js';
import { readSessionSkillManifest } from '../src/core/skills/manifest-store.js';
import { runSkillSessionCommand } from '../src/core/skills/cli-session-command.js';
import { installLocalSkill } from '../src/services/skill-registry-store.js';
import { loadSkillPackage } from '../src/core/skills/package.js';
import { readSkillRegistry } from '../src/services/skill-registry-store.js';
import {
  capabilityArtifactRoot,
  createCapability,
} from '../src/core/capabilities/index.js';

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

describe('session skill runtime preparation', () => {
  let home: string;
  let dataDir: string;
  let src: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'botmux-skill-home-'));
    dataDir = mkdtempSync(join(tmpdir(), 'botmux-skill-data-'));
    src = mkdtempSync(join(tmpdir(), 'botmux-skill-src-'));
    vi.stubEnv('HOME', home);
    vi.stubEnv('SESSION_DATA_DIR', dataDir);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(home, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
  });

  it('leaves prompt unchanged and writes no manifest when bot has no skill policy', () => {
    const result = prepareSessionSkillPrompt({
      sessionId: 's1',
      cliId: 'codex',
      workingDir: '/repo',
      prompt: 'hello',
      botPolicy: undefined,
    });

    expect(result.prompt).toBe('hello');
    expect(result.manifest).toBeNull();
    expect(readSessionSkillManifest('s1')).toBeNull();
  });

  it('writes manifest and appends catalog for configured priority skills', () => {
    write(join(src, 'deploy', 'SKILL.md'), '---\nname: deploy\ndescription: Deploy services\n---\n# Deploy');
    installLocalSkill(join(src, 'deploy'), { link: false });

    const result = prepareSessionSkillPrompt({
      sessionId: 's2',
      cliId: 'codex',
      workingDir: '/repo',
      prompt: 'hello',
      botPolicy: { include: ['skill:deploy'] },
    });

    expect(result.prompt).toContain('hello');
    expect(result.prompt).toContain('<botmux_skills mode="priority">');
    expect(result.prompt).toContain('botmux skill show deploy');
    expect(readSessionSkillManifest('s2')?.prioritySkills.map((s) => s.name)).toEqual(['deploy']);
  });

  it('injects plugin-owned skills without adding them to the user skill registry', () => {
    const pluginRoot = join(src, 'plugin-demo');
    const skillDir = join(pluginRoot, 'skills', 'browser');
    write(join(skillDir, 'SKILL.md'), '---\nname: browser\ndescription: Browser tools\n---\n# Browser');
    const pluginSkill = loadSkillPackage(skillDir, {
      source: { type: 'plugin', pluginId: 'demo', root: pluginRoot },
      id: 'plugin:demo:browser',
    });

    const result = prepareSessionSkillPrompt({
      sessionId: 'plugin-session',
      cliId: 'codex',
      workingDir: '/repo',
      prompt: 'hello',
      botPolicy: undefined,
      pluginSkills: [pluginSkill],
    });

    expect(result.prompt).toContain('botmux skill show browser');
    expect(readSessionSkillManifest('plugin-session')?.prioritySkills[0].source).toEqual({
      type: 'plugin',
      pluginId: 'demo',
      root: pluginRoot,
    });
    expect(readSkillRegistry().skills.browser).toBeUndefined();
  });

  it('injects only the current principal personal capabilities', () => {
    createCapability(dataDir, {
      kind: 'personal',
      larkAppId: 'app_1',
      principal: { kind: 'union', unionId: 'on_current' },
    }, {
      type: 'knowledge',
      name: 'product-context',
      description: 'Product team context',
      instructions: 'The replay platform provides Session Replay capabilities.',
    });
    createCapability(dataDir, {
      kind: 'personal',
      larkAppId: 'app_1',
      principal: { kind: 'union', unionId: 'on_other' },
    }, {
      type: 'knowledge',
      name: 'private-other-context',
      description: 'Another user context',
      instructions: 'This must remain isolated.',
    });

    const result = prepareSessionSkillPrompt({
      sessionId: 'personal-session',
      cliId: 'codex',
      workingDir: '/repo',
      prompt: 'What is the replay platform?',
      botPolicy: undefined,
      dataDir,
      larkAppId: 'app_1',
      personalPrincipal: { kind: 'union', unionId: 'on_current' },
    });

    expect(result.prompt).toContain('botmux skill show product-context');
    expect(result.prompt).not.toContain('private-other-context');
    expect(readSessionSkillManifest('personal-session')?.prioritySkills.map((skill) => skill.name))
      .toEqual(['product-context']);
    expect(runSkillSessionCommand(
      ['show', 'product-context'],
      { BOTMUX_SESSION_ID: 'personal-session' },
    ).stdout).toContain('The replay platform provides Session Replay capabilities.');
  });

  it('injects bot artifacts without a personal principal', () => {
    createCapability(dataDir, {
      kind: 'bot',
      larkAppId: 'app_1',
    }, {
      type: 'knowledge',
      name: 'team-context',
      description: 'Shared team context',
      instructions: 'This context is available to every session for the bot.',
    });

    const result = prepareSessionSkillPrompt({
      sessionId: 'group-session',
      cliId: 'codex',
      workingDir: '/repo',
      prompt: 'Use team context.',
      botPolicy: undefined,
      dataDir,
      larkAppId: 'app_1',
    });

    expect(result.prompt).toContain('botmux skill show team-context');
    expect(readSessionSkillManifest('group-session')?.prioritySkills[0]?.source.type)
      .toBe('bot-artifact');
  });

  it('uses a personal artifact instead of materializing the same-named bot artifact', () => {
    const team = createCapability(dataDir, {
      kind: 'bot',
      larkAppId: 'app_1',
    }, {
      type: 'knowledge',
      name: 'product-context',
      description: 'Shared Product context',
      instructions: 'Use the shared Product convention.',
    });
    createCapability(dataDir, {
      kind: 'personal',
      larkAppId: 'app_1',
      principal: { kind: 'union', unionId: 'on_current' },
    }, {
      type: 'knowledge',
      name: 'product-context',
      description: 'Personal Product context',
      instructions: 'Use my personal Product convention.',
    });

    const result = prepareSessionSkillPrompt({
      sessionId: 'personal-override-session',
      cliId: 'codex',
      workingDir: '/repo',
      prompt: 'Use Product context.',
      botPolicy: undefined,
      dataDir,
      larkAppId: 'app_1',
      personalPrincipal: { kind: 'union', unionId: 'on_current' },
    });

    const manifest = readSessionSkillManifest('personal-override-session');
    expect(result.prompt.match(/botmux skill show product-context/g)).toHaveLength(1);
    expect(manifest?.prioritySkills).toHaveLength(1);
    expect(manifest?.prioritySkills[0]?.source.type).toBe('personal-artifact');
    expect(runSkillSessionCommand(
      ['show', 'product-context'],
      { BOTMUX_SESSION_ID: 'personal-override-session' },
    ).stdout).toContain('Use my personal Product convention.');
    expect(existsSync(join(
      capabilityArtifactRoot(dataDir, team.metadata.scope, team.metadata.artifactId),
      'delivery',
    ))).toBe(false);
  });

  it('refreshes a prompt-less CLI generation and removes stale session skills', () => {
    const pluginRoot = join(src, 'plugin-refresh');
    const skillDir = join(pluginRoot, 'skills', 'browser');
    write(join(skillDir, 'SKILL.md'), '---\nname: browser\ndescription: Browser tools\n---\n# Browser');
    const pluginSkill = loadSkillPackage(skillDir, {
      source: { type: 'plugin', pluginId: 'demo', root: pluginRoot },
      id: 'plugin:demo:browser',
    });

    const prepared = prepareSessionSkillPrompt({
      sessionId: 'refresh-session',
      cliId: 'codex',
      workingDir: '/repo',
      prompt: '',
      botPolicy: undefined,
      pluginSkills: [pluginSkill],
    });
    expect(prepared.prompt).toBe('');
    expect(readSessionSkillManifest('refresh-session')?.prioritySkills.map(skill => skill.name)).toEqual(['browser']);

    prepareSessionSkillPrompt({
      sessionId: 'refresh-session',
      cliId: 'codex',
      workingDir: '/repo',
      prompt: '',
      botPolicy: undefined,
      pluginSkills: [],
    });
    expect(readSessionSkillManifest('refresh-session')).toBeNull();
  });
});
