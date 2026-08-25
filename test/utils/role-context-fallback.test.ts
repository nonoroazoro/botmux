import { describe, expect, it } from 'vitest';
import { applyRoleContextFallback } from '../../src/utils/role-context-fallback.js';

describe('applyRoleContextFallback', () => {
  it('prepends the role to a plain prompt', () => {
    expect(applyRoleContextFallback('turn', undefined, '<role>persona</role>')).toEqual({
      prompt: '<role>persona</role>\n\nturn',
    });
  });

  it('adds the role to Codex App context without dropping existing entries', () => {
    const result = applyRoleContextFallback(
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
    expect(result.codexAppInput?.additionalContext?.botmux_role).toEqual({
      kind: 'application',
      value: '<role>persona</role>',
    });
  });

  it('does not duplicate a role already included in the turn', () => {
    expect(applyRoleContextFallback(
      '<role>persona</role>\n\nturn',
      undefined,
      '<role>persona</role>',
      true,
    )).toEqual({
      prompt: '<role>persona</role>\n\nturn',
    });
  });
});
