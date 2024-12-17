import { z } from 'zod';
import { base32Encode } from './base32-encode';

/** Number of raw bytes in the PlId. */
export const PlIdBytes = 15;
/** Characters in string representation */
export const PlIdLength = 24; // = 15 bytes * 8 bits / 5 bits per char in base32

export const PlId = z
  .string()
  .length(PlIdLength)
  .regex(/[ABCDEFGHIJKLMNOPQRSTUVWXYZ234567]/) // RFC4648
  .brand('PlId');
export type PlId = z.infer<typeof PlId>;

export function uniquePlId(): PlId {
  const data = new Uint8Array(PlIdBytes);
  crypto.getRandomValues(data);
  return PlId.parse(base32Encode(data, 'RFC4648'));
}

export function plId(bytes: Uint8Array): PlId {
  if (bytes.length !== PlIdBytes) throw new Error(`Wrong number of bytes: ${bytes.length}`);
  return PlId.parse(base32Encode(bytes, 'RFC4648'));
}

export async function digestPlId(data: string): Promise<PlId> {
  const encoder = new TextEncoder();
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return plId(new Uint8Array(bytes.slice(0, 15)));
}
