import * as crypto from 'node:crypto';

export async function makeGetSignatureFn() {
  const subtleCrypto = crypto.subtle;

  const privateKey = await subtleCrypto.generateKey(
    {
      name: 'HMAC',
      hash: { name: 'SHA-512' }
    },
    true,
    ['sign', 'verify']
  );

  return async (path: string) => {
    const encoded = new TextEncoder().encode(path);
    const signature = await subtleCrypto.sign('HMAC', privateKey, encoded);
    return new TextDecoder().decode(signature);
  };
}
