import type { Session } from '../types.js';

export function resolveSessionPrincipal(
  session: Pick<Session, 'principalOpenId' | 'ownerOpenId' | 'creatorOpenId'>,
): string | undefined {
  return session.principalOpenId ?? session.ownerOpenId ?? session.creatorOpenId;
}
