import { timingSafeEqual } from 'node:crypto';
import type {
  AuthenticatedTurnOrigin,
  ManagedTurnOrigin,
} from './index.js';

export function authenticateManagedTurnOrigin(
  liveOrigin: ManagedTurnOrigin | undefined,
  claimedCapability: string | undefined,
): Readonly<AuthenticatedTurnOrigin> | null {
  if (!liveOrigin
    || !claimedCapability
    || !/^[a-f0-9]{32,128}$/iu.test(liveOrigin.capability)
    || !/^[a-f0-9]{32,128}$/iu.test(claimedCapability)) {
    return null;
  }
  const liveCapability = Buffer.from(liveOrigin.capability, 'utf8');
  const claim = Buffer.from(claimedCapability, 'utf8');
  if (liveCapability.length !== claim.length || !timingSafeEqual(liveCapability, claim)) {
    return null;
  }
  return {
    ...(liveOrigin.turnId ? { turnId: liveOrigin.turnId } : {}),
    ...(liveOrigin.dispatchAttempt !== undefined
      ? { dispatchAttempt: liveOrigin.dispatchAttempt }
      : {}),
  };
}
