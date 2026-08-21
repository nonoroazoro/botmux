import { describe, expect, it } from 'vitest';
import { CodexCyberPolicyRecovery } from '../../src/core/CodexCyberPolicyRecovery.js';

describe('CodexCyberPolicyRecovery', () => {
  it('builds a conservative read-only prompt without copying prior assistant output', () => {
    const recovery = new CodexCyberPolicyRecovery();
    const prompt = recovery.buildPrompt(
      '<botmux_routing>route to the existing topic</botmux_routing>',
      '<user_message>Review the reported issue.</user_message>',
    );

    expect(prompt).toContain('read-only defensive analysis');
    expect(prompt).toContain('Focus first on whether the local source code contains');
    expect(prompt).toContain('executing a PoC');
    expect(prompt).toContain('replaying an exploit');
    expect(prompt).toContain('<botmux_routing>route to the existing topic</botmux_routing>');
    expect(prompt).toContain('<user_message>Review the reported issue.</user_message>');
    expect(prompt).not.toContain('previous assistant output');
  });

  it('does not duplicate identical opening and current contexts', () => {
    const recovery = new CodexCyberPolicyRecovery();
    const context = '<user_message>Review the issue.</user_message>';
    const prompt = recovery.buildPrompt(context, context);

    expect(prompt.split(context)).toHaveLength(2);
  });
});
