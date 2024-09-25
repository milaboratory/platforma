import type { AuthInformation } from './config';
import { parsePlJwt } from '../util/pl';

/** Returns a timestamp when current authorization information should be refreshed.
 * Compare the value with Date.now(). */
export function inferAuthRefreshTime(
  info: AuthInformation,
  maxRefreshSeconds: number
): number | undefined {
  if (info.jwtToken === undefined) return undefined;

  const { exp, iat } = parsePlJwt(info.jwtToken);

  return (
    Math.min(
      // in the middle between issue and expiration time points
      (iat + exp) / 2,
      iat + maxRefreshSeconds
    ) * 1000
  );
}

export function expirationFromAuthInformation(authInfo: AuthInformation): number | undefined {
  if (authInfo.jwtToken === undefined) return undefined;
  const parsed = parsePlJwt(authInfo.jwtToken);
  return parsed.exp * 1000;
}
