import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { registerBot } from '../../../src/bot-registry.js';
import { writeRoleFile } from '../../../src/core/role-resolver.js';
import { resolveAgentContext, writeSoul } from '../../../src/core/personality/index.js';

const roots: string[] = [];
const originalDataDir = process.env.SESSION_DATA_DIR;

afterEach(() => {
  if (originalDataDir === undefined) delete process.env.SESSION_DATA_DIR;
  else process.env.SESSION_DATA_DIR = originalDataDir;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('agent context', () => {
  it('composes reaction policy, effective Soul, and current Role into one revision', () => {
    const root = mkdtempSync(join(tmpdir(), 'botmux-agent-context-'));
    roots.push(root);
    process.env.SESSION_DATA_DIR = join(root, 'data');
    const appId = `cli_personality_${Date.now()}`;
    registerBot({ larkAppId: appId, larkAppSecret: 'secret', cliId: 'codex' });

    const initial = resolveAgentContext(appId, 'oc_personality');
    expect(initial.block).toContain('<personality source="default">');
    expect(initial.block).toContain('botmux react no');
    expect(initial.reactionReminder).toContain('must first use `botmux react no`');
    expect(initial.block).not.toContain('<role ');

    writeSoul(appId, '# Custom Soul\n\nPrefer strong opinions.', process.env.SESSION_DATA_DIR);
    writeRoleFile(appId, 'oc_personality', 'Act as the incident commander.');
    const customized = resolveAgentContext(appId, 'oc_personality');
    expect(customized.block).toContain('<personality source="custom">');
    expect(customized.block).toContain('Prefer strong opinions.');
    expect(customized.block).toContain('<role context="group" chat_id="oc_personality">');
    expect(customized.revision).not.toBe(initial.revision);
  });

  it('omits reaction instructions when the kill switch is off', () => {
    const root = mkdtempSync(join(tmpdir(), 'botmux-agent-context-disabled-'));
    roots.push(root);
    process.env.SESSION_DATA_DIR = join(root, 'data');
    const appId = `cli_personality_off_${Date.now()}`;
    registerBot({
      larkAppId: appId,
      larkAppSecret: 'secret',
      cliId: 'codex',
      personalityReactions: false,
    });
    const context = resolveAgentContext(appId, 'oc_personality_off');
    expect(context.block).not.toContain('<reaction_policy>');
    expect(context.reactionReminder).toBe('');
  });
});
