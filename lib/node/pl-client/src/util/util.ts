function isArrayBufferOrView(value: unknown): value is ArrayBufferLike {
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value);
}

export function toBytes(value: string | Uint8Array): Uint8Array {
  if (typeof value === 'string') return Buffer.from(value);
  else if (isArrayBufferOrView(value)) return value;
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  else throw new Error(`Unexpected type: ${value}`);
}
