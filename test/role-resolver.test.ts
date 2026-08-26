/**
 * Per-bot, per-chat role resolution + prompt injection.
 *
 * Guards the storage contract (under config.session.dataDir, keyed by
 * larkAppId so bots sharing a workingDir stay isolated) and that
 * buildNewTopicPrompt injects a <role> block when given { larkAppId, chatId }.
 * Run: pnpm vitest run test/role-resolver.test.ts
 */
import { mkdtempSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let dataDir: string;

/** Re-import role-resolver (and config) fresh so SESSION_DATA_DIR is honored. */
async function fresh() {
  vi.resetModules();
  return import('../src/core/role-resolver.js');
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'botmux-role-'));
  process.env.SESSION_DATA_DIR = dataDir;
});
afterEach(() => { delete process.env.SESSION_DATA_DIR; vi.restoreAllMocks(); });

describe('role-resolver storage', () => {
  it('writes under {dataDir}/roles/{larkAppId}/{chatId}.md and reads it back', async () => {
    const { writeRoleFile, resolveRoleFile } = await fresh();
    writeRoleFile('app1', 'oc_x', '# 代码审查员\n严肃，只看正确性。');
    const expectedPath = join(dataDir, 'roles', 'app1', 'oc_x.md');
    expect(existsSync(expectedPath)).toBe(true);
    expect(resolveRoleFile('app1', 'oc_x')).toContain('代码审查员');
  });

  it('rejects invalid chat ids for role file writes', async () => {
    const { writeRoleFile, resolveRoleFile, deleteRoleFile } = await fresh();
    expect(resolveRoleFile('app1', '../escape')).toBeNull();
    expect(() => writeRoleFile('app1', '../escape', 'bad')).toThrow(/invalid chat id/);
    expect(deleteRoleFile('app1', '../escape')).toBe(false);
  });

  it('keys on larkAppId — two bots sharing a chatId do not collide', async () => {
    const { writeRoleFile, resolveRoleFile } = await fresh();
    writeRoleFile('app1', 'oc_shared', 'role-A');
    writeRoleFile('app2', 'oc_shared', 'role-B');
    expect(resolveRoleFile('app1', 'oc_shared')).toBe('role-A');
    expect(resolveRoleFile('app2', 'oc_shared')).toBe('role-B');
  });

  it('returns null when no role file exists, and after delete', async () => {
    const { writeRoleFile, resolveRoleFile, deleteRoleFile } = await fresh();
    expect(resolveRoleFile('app1', 'oc_none')).toBeNull();
    writeRoleFile('app1', 'oc_y', 'hi');
    expect(deleteRoleFile('app1', 'oc_y')).toBe(true);
    expect(resolveRoleFile('app1', 'oc_y')).toBeNull();
    expect(deleteRoleFile('app1', 'oc_y')).toBe(false); // already gone
  });

  it('truncates content to MAX_ROLE_BYTES by UTF-8 byte length, on a char boundary', async () => {
    const { writeRoleFile, resolveRoleFile, MAX_ROLE_BYTES } = await fresh();
    // Write well over the limit in CJK (3 bytes each) so truncation must fire.
    const overCount = Math.ceil(MAX_ROLE_BYTES / 3) + 1000;
    writeRoleFile('app1', 'oc_big', '中'.repeat(overCount));
    const got = resolveRoleFile('app1', 'oc_big')!;
    expect(Buffer.byteLength(got, 'utf-8')).toBeLessThanOrEqual(MAX_ROLE_BYTES);
    // No partial/replacement char at the cut (would appear as U+FFFD).
    expect(got).not.toContain('�');
    // The raised limit is well above the old 4 KB.
    expect(MAX_ROLE_BYTES).toBeGreaterThan(4096);
  });
});

describe('agent context delivery', () => {
  it('computes stable revisions for the effective agent context', async () => {
    const { writeRoleFile } = await fresh();
    const { resolveAgentContext } = await import('../src/core/personality/index.js');
    const emptyFirst = resolveAgentContext('app1', 'oc_r');
    const emptySecond = resolveAgentContext('app1', 'oc_r');
    expect(emptySecond.revision).toBe(emptyFirst.revision);
    writeRoleFile('app1', 'oc_r', 'PERSONA');
    const first = resolveAgentContext('app1', 'oc_r');
    const second = resolveAgentContext('app1', 'oc_r');
    expect(first.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(second.revision).toBe(first.revision);
    expect(first.revision).not.toBe(emptyFirst.revision);
  });

  it('includes the chat identity in the effective agent context revision', async () => {
    const { writeTeamRoleFile } = await fresh();
    const { resolveAgentContext } = await import('../src/core/personality/index.js');
    writeTeamRoleFile('app1', 'SHARED_TEAM_PERSONA');
    const first = resolveAgentContext('app1', 'oc_first');
    const second = resolveAgentContext('app1', 'oc_second');
    expect(first.block).toContain('SHARED_TEAM_PERSONA');
    expect(second.block).toContain('SHARED_TEAM_PERSONA');
    expect(first.revision).not.toBe(second.revision);
  });

  it('injects at opening, skips an unchanged follow-up, and re-injects a changed role', async () => {
    await fresh();
    const { writeRoleFile } = await import('../src/core/role-resolver.js');
    const { buildFollowUpCliInput, buildNewTopicCliInput } = await import('../src/core/session-manager.js');
    writeRoleFile('app1', 'oc_auto', 'PERSONA_V1');

    const opening = buildNewTopicCliInput(
      'hi', 's1', 'claude-code', undefined,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      { larkAppId: 'app1', chatId: 'oc_auto' },
    );
    expect(opening.content).toContain('PERSONA_V1');
    expect(opening.agentContextFallbackBlock).toContain('PERSONA_V1');
    expect(opening.agentContextIncluded).toBe(true);

    const unchanged = buildFollowUpCliInput('again', 's1', {
      larkAppId: 'app1',
      chatId: 'oc_auto',
      agentContextRevision: opening.agentContextRevision,
    });
    expect(unchanged.content).not.toContain('<role');
    expect(unchanged.agentContextFallbackBlock).toContain('PERSONA_V1');
    expect(unchanged.agentContextFallbackBlock).toContain('chat_id="oc_auto"');
    expect(unchanged.agentContextIncluded).toBeUndefined();

    writeRoleFile('app1', 'oc_auto', 'PERSONA_V2');
    const changed = buildFollowUpCliInput('again', 's1', {
      larkAppId: 'app1',
      chatId: 'oc_auto',
      agentContextRevision: opening.agentContextRevision,
    });
    expect(changed.content).toContain('PERSONA_V2');
    expect(changed.content).toContain('supersedes="previous"');
    expect(changed.agentContextRevision).not.toBe(opening.agentContextRevision);
    expect(changed.agentContextFallbackBlock).toContain('PERSONA_V2');
    expect(changed.agentContextIncluded).toBe(true);
  });

  it('re-injects after a context refresh and supersedes a removed role', async () => {
    await fresh();
    const { deleteRoleFile, writeRoleFile } = await import('../src/core/role-resolver.js');
    const { buildFollowUpCliInput, buildNewTopicCliInput } = await import('../src/core/session-manager.js');
    writeRoleFile('app1', 'oc_refresh', 'REFRESH_PERSONA');
    const opening = buildNewTopicCliInput(
      'hi', 's1', 'claude-code', undefined,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      { larkAppId: 'app1', chatId: 'oc_refresh' },
    );

    const refreshed = buildFollowUpCliInput('after compact', 's1', {
      larkAppId: 'app1',
      chatId: 'oc_refresh',
      agentContextRevision: opening.agentContextRevision,
      agentContextRefreshRequired: true,
    });
    expect(refreshed.content).toContain('REFRESH_PERSONA');

    deleteRoleFile('app1', 'oc_refresh');
    const reset = buildFollowUpCliInput('after delete', 's1', {
      larkAppId: 'app1',
      chatId: 'oc_refresh',
      agentContextRevision: opening.agentContextRevision,
      agentContextRefreshRequired: true,
    });
    expect(reset.content).toContain('<agent_context supersedes="previous">');
    expect(reset.content).toContain('<personality source="default">');
    expect(reset.content).not.toContain('REFRESH_PERSONA');
    expect(reset.agentContextRevision).not.toBe(opening.agentContextRevision);
  });

  it('re-injects Agent Context into a refork context', async () => {
    await fresh();
    const { writeRoleFile } = await import('../src/core/role-resolver.js');
    const { resolveAgentContext } = await import('../src/core/personality/index.js');
    const { buildReforkCliInput } = await import('../src/core/session-manager.js');
    writeRoleFile('app1', 'oc_refork', 'REFORK_PERSONA');
    const revision = resolveAgentContext('app1', 'oc_refork').revision;
    const ds = {
      larkAppId: 'app1',
      session: {
        sessionId: 's-refork',
        chatId: 'oc_refork',
        agentContextRevision: revision,
      },
    } as any;
    const refork = buildReforkCliInput(ds, 'continue', { cliId: 'claude-code', locale: 'en' });
    expect(refork.content).toContain('REFORK_PERSONA');
    expect(refork.agentContextRevision).toBe(revision);
  });

});

describe('buildNewTopicPrompt role injection', () => {
  it('injects a <role> block when { larkAppId, chatId } resolves a role', async () => {
    await fresh();
    const { writeRoleFile } = await import('../src/core/role-resolver.js');
    writeRoleFile('app1', 'oc_z', 'PERSONA_MARKER');
    const { buildNewTopicPrompt } = await import('../src/core/session-manager.js');
    const prompt = buildNewTopicPrompt(
      'hello', 'sess1', 'claude-code', undefined,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      { larkAppId: 'app1', chatId: 'oc_z' },
    );
    expect(prompt).toContain('<role context="group" chat_id="oc_z">');
    expect(prompt).toContain('PERSONA_MARKER');
  });

  it('omits the <role> block when no role exists', async () => {
    await fresh();
    const { buildNewTopicPrompt } = await import('../src/core/session-manager.js');
    const prompt = buildNewTopicPrompt(
      'hello', 'sess1', 'claude-code', undefined,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      { larkAppId: 'app1', chatId: 'oc_absent' },
    );
    expect(prompt).not.toContain('<role');
  });
});

describe('team-level role + layered resolution', () => {
  it('writes/reads team role under {dataDir}/team-roles/{larkAppId}.md', async () => {
    const { writeTeamRoleFile, resolveTeamRoleFile } = await fresh();
    writeTeamRoleFile('app1', '# 后端机器人\n擅长服务端。');
    expect(existsSync(join(dataDir, 'team-roles', 'app1.md'))).toBe(true);
    expect(resolveTeamRoleFile('app1')).toContain('后端机器人');
  });

  it('resolveRole layers: chat override ＞ team ＞ none', async () => {
    const { writeRoleFile, writeTeamRoleFile, deleteRoleFile, resolveRole } = await fresh();
    expect(resolveRole('app1', 'oc_a')).toEqual({ content: null, source: 'none' });
    writeTeamRoleFile('app1', 'TEAM_ROLE');
    expect(resolveRole('app1', 'oc_a')).toEqual({ content: 'TEAM_ROLE', source: 'team' });
    writeRoleFile('app1', 'oc_a', 'CHAT_ROLE');
    expect(resolveRole('app1', 'oc_a')).toEqual({ content: 'CHAT_ROLE', source: 'chat' });
    deleteRoleFile('app1', 'oc_a');
    expect(resolveRole('app1', 'oc_a')).toEqual({ content: 'TEAM_ROLE', source: 'team' });
  });

  it('team role is per-bot (keyed on larkAppId), shared across chats', async () => {
    const { writeTeamRoleFile, resolveRole } = await fresh();
    writeTeamRoleFile('app1', 'A');
    writeTeamRoleFile('app2', 'B');
    expect(resolveRole('app1', 'oc_any').content).toBe('A');
    expect(resolveRole('app2', 'oc_any').content).toBe('B');
  });

  it('deleteTeamRoleFile removes it', async () => {
    const { writeTeamRoleFile, deleteTeamRoleFile, resolveTeamRoleFile } = await fresh();
    writeTeamRoleFile('app1', 'X');
    expect(deleteTeamRoleFile('app1')).toBe(true);
    expect(resolveTeamRoleFile('app1')).toBeNull();
    expect(deleteTeamRoleFile('app1')).toBe(false);
  });
});

describe('buildNewTopicPrompt team-role injection', () => {
  it('injects team role with context="team" when no per-chat override', async () => {
    await fresh();
    const { writeTeamRoleFile } = await import('../src/core/role-resolver.js');
    writeTeamRoleFile('app1', 'TEAM_PERSONA');
    const { buildNewTopicPrompt } = await import('../src/core/session-manager.js');
    const prompt = buildNewTopicPrompt(
      'hello', 'sess1', 'claude-code', undefined,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      { larkAppId: 'app1', chatId: 'oc_team' },
    );
    expect(prompt).toContain('<role context="team" chat_id="oc_team">');
    expect(prompt).toContain('TEAM_PERSONA');
  });
});

describe('buildFollowUpContent role injection', () => {
  it('places stable role context before the follow-up user message', async () => {
    await fresh();
    const { writeRoleFile } = await import('../src/core/role-resolver.js');
    writeRoleFile('app1', 'oc_follow', 'FOLLOWUP_PERSONA');
    const { buildFollowUpContent } = await import('../src/core/session-manager.js');
    const prompt = buildFollowUpContent('follow up', 'sess-follow', {
      larkAppId: 'app1',
      chatId: 'oc_follow',
      sender: { openId: 'ou_sender', type: 'user', name: 'Sender' },
      mentions: [{ name: 'Reviewer', openId: 'ou_reviewer' }],
    });

    expect(prompt).toContain('<role context="group" chat_id="oc_follow">');
    expect(prompt).toContain('FOLLOWUP_PERSONA');
    expect(prompt.indexOf('<session_id>')).toBeLessThan(prompt.indexOf('<role '));
    expect(prompt.indexOf('<role ')).toBeLessThan(prompt.indexOf('<botmux_reminder>'));
    expect(prompt.indexOf('<botmux_reminder>')).toBeLessThan(prompt.indexOf('<user_message>'));
    expect(prompt.indexOf('<sender ')).toBeGreaterThan(prompt.indexOf('</user_message>'));
    expect(prompt.indexOf('<mentions>')).toBeGreaterThan(prompt.indexOf('</user_message>'));
  });
});
