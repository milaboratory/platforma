export function toBytes(value: string | Uint8Array): Uint8Array {
  if (typeof value === 'string')
    return Buffer.from(value);
  else
    return value;
}
