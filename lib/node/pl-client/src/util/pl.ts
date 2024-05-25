import { AuthInformation } from '../core/config';

export type PlJWTPayload = {
  user: {
    login: string
  },
  exp: number,
  iat: number
};

export function parsePlJwt(token: string): PlJWTPayload {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
}

/** Returns a timestamp when current authorization information should be refreshed.
 * Compare the value with Date.now(). */
export function inferAuthRefreshTime(info: AuthInformation, maxRefreshSeconds: number): number | undefined {
  if (info.jwtToken === undefined)
    return undefined;

  const { exp, iat } = parsePlJwt(info.jwtToken);

  return Math.min(
    // in the middle between issue and expiration time points
    (iat + exp) / 2,
    iat + maxRefreshSeconds
  ) * 1000;
}
