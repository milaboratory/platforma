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
