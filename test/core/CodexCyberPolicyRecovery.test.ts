import { describe, expect, it } from 'vitest';
import { CodexCyberPolicyRecovery } from '../../src/core/CodexCyberPolicyRecovery.js';
import type { CodexBridgeEvent } from '../../src/services/codex-transcript.js';

function event(
  kind: 'user' | 'assistant_final',
  text: string,
  options: Pick<CodexBridgeEvent, 'terminalStatus' | 'terminalErrorCode'> = {},
): CodexBridgeEvent {
  return {
    uuid: `${kind}-${text}`,
    timestampMs: 1,
    kind,
    text,
    ...options,
  };
}

describe('CodexCyberPolicyRecovery', () => {
  it('builds a safety-first conservative read-only prompt', () => {
    const recovery = new CodexCyberPolicyRecovery();
    const prompt = recovery.buildPrompt(
      '<botmux_routing>route to the existing topic</botmux_routing>',
      '<user_message>Review the reported issue.</user_message>',
    );

    expect(prompt).toContain('read-only defensive analysis');
    expect(prompt).toContain('Focus first on whether the local source code contains');
    expect(prompt).toContain('executing a PoC');
    expect(prompt).toContain('replaying an exploit');
    expect(prompt).toContain('sole source for the previous conversation');
    expect(prompt).toContain('Do not reconstruct it from Lark topic history');
    expect(prompt).toContain('<botmux_routing>route to the existing topic</botmux_routing>');
    expect(prompt).toContain('<user_message>Review the reported issue.</user_message>');
    expect(prompt).not.toContain('previous assistant output');
    expect(prompt.indexOf('<botmux_cybersecurity_recovery>')).toBe(0);
    expect(prompt.indexOf('</botmux_cybersecurity_recovery>'))
      .toBeLessThan(prompt.indexOf('<botmux_routing>'));
  });

  it('does not duplicate identical opening and current contexts', () => {
    const recovery = new CodexCyberPolicyRecovery();
    const context = '<user_message>Review the issue.</user_message>';
    const prompt = recovery.buildPrompt(context, context);

    expect(prompt.split(context)).toHaveLength(2);
  });

  it('does not duplicate an opening prompt already present in the recovered conversation', () => {
    const recovery = new CodexCyberPolicyRecovery();
    const opening = '<botmux_routing>keep the existing route</botmux_routing>';
    const conversation = [
      '<botmux_recovered_codex_conversation>',
      '<message role="user">',
      '&lt;botmux_routing&gt;keep the existing route&lt;/botmux_routing&gt;',
      '</message>',
      '</botmux_recovered_codex_conversation>',
    ].join('\n');

    const prompt = recovery.buildPrompt(opening, conversation);

    expect(prompt.split('keep the existing route')).toHaveLength(2);
  });

  it('uses the requested policy event as the exact extraction boundary', () => {
    const recovery = new CodexCyberPolicyRecovery();
    const firstPolicy = event('assistant_final', 'First policy response', {
      terminalStatus: 'failed',
      terminalErrorCode: 'codex_task_error:cyber_policy',
    });
    const secondPolicy = event('assistant_final', 'Second policy response', {
      terminalStatus: 'failed',
      terminalErrorCode: 'codex_task_error:cyber_policy',
    });
    firstPolicy.uuid = 'policy-first';
    secondPolicy.uuid = 'policy-second';

    const context = recovery.extractConversation([
      event('user', 'First task'),
      firstPolicy,
      event('user', 'Second task'),
      secondPolicy,
    ], { boundaryEventUuid: firstPolicy.uuid });

    expect(context).toContain('First task');
    expect(context).not.toContain('Second task');
  });

  it('extracts completed conversation turns and excludes policy and failed assistant output', () => {
    const recovery = new CodexCyberPolicyRecovery();
    const context = recovery.extractConversation([
      event('user', 'First question'),
      event('assistant_final', 'First answer'),
      event('user', 'Second question'),
      event('assistant_final', 'Transient failure', {
        terminalStatus: 'failed',
        terminalErrorCode: 'codex_task_error',
      }),
      event('user', 'Inspect the reported security issue'),
      event('assistant_final', "This content can't be shown", {
        terminalStatus: 'failed',
        terminalErrorCode: 'codex_task_error:cyber_policy',
      }),
      event('assistant_final', 'Recovery card text'),
    ]);

    expect(context).toContain('<message role="user">\nFirst question\n</message>');
    expect(context).toContain('<message role="assistant">\nFirst answer\n</message>');
    expect(context).toContain('Second question');
    expect(context).toContain('Inspect the reported security issue');
    expect(context).not.toContain('Transient failure');
    expect(context).not.toContain("This content can't be shown");
    expect(context).not.toContain('Recovery card text');
  });

  it('escapes transcript text and requires an exact cyber-policy terminal', () => {
    const recovery = new CodexCyberPolicyRecovery();

    expect(recovery.extractConversation([
      event('user', '<task>review & explain</task>'),
      event('assistant_final', 'Generic refusal', {
        terminalStatus: 'failed',
        terminalErrorCode: 'codex_task_error',
      }),
    ])).toBeUndefined();

    const context = recovery.extractConversation([
      event('user', '<task>review & explain</task>'),
      event('assistant_final', 'Policy response', {
        terminalStatus: 'failed',
        terminalErrorCode: 'codex_task_error:cyber_policy',
      }),
    ]);
    expect(context).toContain('&lt;task&gt;review &amp; explain&lt;/task&gt;');
    expect(context).not.toContain('Policy response');
  });

  it('removes earlier policy terminals when a later recovery is blocked again', () => {
    const recovery = new CodexCyberPolicyRecovery();
    const context = recovery.extractConversation([
      event('user', 'Original security review'),
      event('assistant_final', 'First policy response', {
        terminalStatus: 'failed',
        terminalErrorCode: 'codex_task_error:cyber_policy',
      }),
      event('user', 'Retry with conservative analysis'),
      event('assistant_final', 'Second policy response', {
        terminalStatus: 'failed',
        terminalErrorCode: 'codex_task_error:cyber_policy',
      }),
    ]);

    expect(context).toContain('Original security review');
    expect(context).toContain('Retry with conservative analysis');
    expect(context).not.toContain('First policy response');
    expect(context).not.toContain('Second policy response');
  });

  it('keeps the newest turns and reports bounded omissions for long conversations', () => {
    const recovery = new CodexCyberPolicyRecovery();
    const history = Array.from({ length: 205 }, (_, index) =>
      event(index % 2 === 0 ? 'user' : 'assistant_final', `message-${index}`));
    const context = recovery.extractConversation([
      ...history,
      event('user', 'Blocked current request'),
      event('assistant_final', 'Policy response', {
        terminalStatus: 'failed',
        terminalErrorCode: 'codex_task_error:cyber_policy',
      }),
    ]);

    expect(context).toContain('<omitted message_count="6" />');
    expect(context).not.toContain('message-0\n');
    expect(context).toContain('message-204');
    expect(context).toContain('Blocked current request');
    expect(context).not.toContain('Policy response');
  });

  it('marks an earlier omission reported by the bounded rollout reader', () => {
    const recovery = new CodexCyberPolicyRecovery();
    const policy = event('assistant_final', 'Policy response', {
      terminalStatus: 'failed',
      terminalErrorCode: 'codex_task_error:cyber_policy',
    });

    const context = recovery.extractConversation([
      event('user', 'Newest retained task'),
      policy,
    ], {
      boundaryEventUuid: policy.uuid,
      earlierMessagesOmitted: true,
    });

    expect(context).toContain('<omitted earlier_messages="true" />');
  });

  it('marks an omitted prefix when a single retained message exceeds the character limit', () => {
    const recovery = new CodexCyberPolicyRecovery();
    const context = recovery.extractConversation([
      event('user', `prefix-${'x'.repeat(120_000)}`),
      event('assistant_final', 'Policy response', {
        terminalStatus: 'failed',
        terminalErrorCode: 'codex_task_error:cyber_policy',
      }),
    ]);

    expect(context).toContain('<omitted message_prefix="true" />');
    expect(context).not.toContain('prefix-');
  });
});
