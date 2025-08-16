const publicKey = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAECGShTw8Plag1uMuCg9OMYVHCF+wzjvXKr3cihyO77jEe9CrF6RP9tfnCd2XjM7XqQ0QH3i41rz5ohCB9fDDBbQ==';

const splitAndValidateToken = (token: string): [string, string, string] => {
  const [base64Header, base64Payload, signature] = token.split('.');
  if (!base64Header || typeof base64Payload !== 'string' || typeof signature !== 'string')
    throw new Error('Invalid token body');
  return [base64Header, base64Payload, signature];
};

export const parseToken = (token: string) => {
  const [, base64Payload] = splitAndValidateToken(token);
  return JSON.parse(atob(base64Payload));
};

export async function verify(token: string) {
  const cryptoPublicKey = await crypto.subtle.importKey(
    'spki',
    Uint8Array.from(atob(publicKey), (c) => c.charCodeAt(0)).buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify'],
  );

  const [base64Header, base64Payload, signature] = splitAndValidateToken(token);

  const signatureBinary = Uint8Array.from(
    atob(signature.replace(/-/g, '+').replace(/_/g, '/')),
    (c) => c.charCodeAt(0),
  );

  try {
    const result = await crypto.subtle.verify(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      cryptoPublicKey,
      signatureBinary,
      new TextEncoder().encode(`${base64Header}.${base64Payload}`),
    );

    if (result) return 'Signature is correct';
    else return 'Signature is incorrect';
  } catch (_e: unknown) {
    return 'Verification failed';
  }
}
