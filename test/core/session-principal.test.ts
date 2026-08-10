import { describe, expect, it } from 'vitest';

import { resolveSessionPrincipal } from '../../src/core/session-principal.js';

describe('resolveSessionPrincipal', () => {
  it('keeps the frozen principal when caller metadata changes', () => {
    expect(resolveSessionPrincipal({
      principalOpenId: 'ou_first',
      ownerOpenId: 'ou_owner',
      creatorOpenId: 'ou_creator',
    })).toBe('ou_first');
  });

  it('migrates older sessions from owner or creator identity', () => {
    expect(resolveSessionPrincipal({ ownerOpenId: 'ou_owner' })).toBe('ou_owner');
    expect(resolveSessionPrincipal({ creatorOpenId: 'ou_creator' })).toBe('ou_creator');
  });
});
