export function toHeadersMap(
  headers: { name: string; value: string }[],
  fromBytes?: number,
  toBytes?: number,
): Record<string, string> {
  const result = Object.fromEntries(headers.map(({ name, value }) => [name, value]));
  if (fromBytes !== undefined && toBytes !== undefined) {
    result['Range'] = `bytes=${fromBytes}-${toBytes}`;
  }

  return result;
}
