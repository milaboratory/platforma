export function toHeadersMap(
  headers: { name: string; value: string }[],
  fromBytes?: number, // including this byte
  toBytes?: number, // excluding this byte
): Record<string, string> {
  const result = Object.fromEntries(headers.map(({ name, value }) => [name, value]));
  if (fromBytes !== undefined && toBytes !== undefined) {
    result['Range'] = `bytes=${fromBytes}-${toBytes - 1}`;
  }

  return result;
}
