import { createHash } from 'node:crypto';

import type { Session } from '../../types.js';
import { resolveSessionPrincipal } from '../session-principal.js';

export type PersonalPrincipal =
  | { kind: 'union'; unionId: string }
  | { kind: 'app_open'; larkAppId: string; openId: string };

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function validatePersonalPrincipal(value: unknown): PersonalPrincipal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid personal capability principal');
  }
  const principal = value as Record<string, unknown>;
  if (
    principal.kind === 'union'
    && typeof principal.unionId === 'string'
    && principal.unionId.startsWith('on_')
  ) {
    return { kind: 'union', unionId: principal.unionId };
  }
  if (
    principal.kind === 'app_open'
    && typeof principal.larkAppId === 'string'
    && principal.larkAppId.trim()
    && typeof principal.openId === 'string'
    && principal.openId.startsWith('ou_')
  ) {
    return {
      kind: 'app_open',
      larkAppId: principal.larkAppId.trim(),
      openId: principal.openId,
    };
  }
  throw new Error('Invalid personal capability principal');
}

export function personalPrincipalIdentity(value: PersonalPrincipal): string {
  const principal = validatePersonalPrincipal(value);
  return principal.kind === 'union'
    ? `union:${principal.unionId}`
    : `app:${principal.larkAppId}:open:${principal.openId}`;
}

export function personalPrincipalKey(value: PersonalPrincipal): string {
  return sha256(personalPrincipalIdentity(value)).slice(0, 32);
}

export function resolveSessionPersonalPrincipal(
  session: Pick<Session, 'chatType' | 'ownerUnionId' | 'principalOpenId' | 'ownerOpenId' | 'creatorOpenId' | 'larkAppId'>,
): PersonalPrincipal | undefined {
  if (session.chatType !== 'p2p') return undefined;
  if (session.ownerUnionId?.startsWith('on_')) {
    return { kind: 'union', unionId: session.ownerUnionId };
  }
  const openId = resolveSessionPrincipal(session);
  if (!openId?.startsWith('ou_') || !session.larkAppId?.trim()) return undefined;
  return { kind: 'app_open', larkAppId: session.larkAppId, openId };
}
