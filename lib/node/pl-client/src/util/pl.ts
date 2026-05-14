export type PlJWTPayload = {
  uid: string;

  // deprecated. Prior backend capability auth:v2. Use uid instead.
  user: {
    login: string;
  };

  exp: number;
  iat: number;
};

export function parsePlJwt(token: string): PlJWTPayload {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
}
