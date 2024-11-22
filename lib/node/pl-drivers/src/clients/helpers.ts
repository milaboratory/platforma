export function toHeadersMap(headers: { name: string; value: string }[]): Record<string, string> {
  return Object.fromEntries(headers.map(({ name, value }) => [name, value]));
}
