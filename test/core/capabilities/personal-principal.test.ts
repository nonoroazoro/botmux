import { describe, expect, it } from 'vitest';

import {
  personalPrincipalKey,
  resolveSessionPersonalPrincipal,
} from '../../../src/core/capabilities/index.js';

describe('personal capability principal', () => {
  it('prefers the cross-app union identity', () => {
    const principal = resolveSessionPersonalPrincipal({
      ownerUnionId: 'on_user',
      principalOpenId: 'ou_user',
      larkAppId: 'app_1',
      chatType: 'p2p',
    });

    expect(principal).toEqual({ kind: 'union', unionId: 'on_user' });
  });

  it('falls back to an app-scoped open identity', () => {
    const principal = resolveSessionPersonalPrincipal({
      principalOpenId: 'ou_user',
      larkAppId: 'app_1',
      chatType: 'p2p',
    });

    expect(principal).toEqual({ kind: 'app_open', larkAppId: 'app_1', openId: 'ou_user' });
  });

  it('does not inject personal content into shared group sessions', () => {
    expect(resolveSessionPersonalPrincipal({
      ownerUnionId: 'on_user',
      principalOpenId: 'ou_user',
      larkAppId: 'app_1',
      chatType: 'group',
    })).toBeUndefined();
  });

  it('uses different storage keys for different principals', () => {
    expect(personalPrincipalKey({ kind: 'union', unionId: 'on_a' }))
      .not.toBe(personalPrincipalKey({ kind: 'union', unionId: 'on_b' }));
  });
});
