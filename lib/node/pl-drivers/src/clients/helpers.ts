export function toHeadersMap(headers: { name: string; value: string }[], range?: string): Record<string, string> {
  const result = Object.fromEntries(headers.map(({ name, value }) => [name, value]));
  if (range) {
    result['Range'] = range;
  }

  return result;
}
