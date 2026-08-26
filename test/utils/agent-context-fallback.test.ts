import { describe, expect, it } from 'vitest';
import { applyAgentContextFallback } from '../../src/utils/agent-context-fallback.js';

describe('applyAgentContextFallback', () => {
  it('prepends the role to a plain prompt', () => {
    expect(applyAgentContextFallback('turn', undefined, '<role>persona</role>')).toEqual({
      prompt: '<role>persona</role>\n\nturn',
    });
  });

  it('adds the role to Codex App context without dropping existing entries', () => {
    const result = applyAgentContextFallback(
      'turn',
      {
        text: 'visible',
        additionalContext: {
          existing: { kind: 'application', value: 'keep' },
        },
      },
      '<role>persona</role>',
    );

    expect(result.codexAppInput?.additionalContext?.existing?.value).toBe('keep');
    expect(result.codexAppInput?.additionalContext?.botmux_agent_context).toEqual({
      kind: 'application',
      value: '<role>persona</role>',
    });
  });

  it('does not duplicate a role already included in the turn', () => {
    expect(applyAgentContextFallback(
      '<role>persona</role>\n\nturn',
      undefined,
      '<role>persona</role>',
      true,
    )).toEqual({
      prompt: '<role>persona</role>\n\nturn',
    });
  });
});
