export function jsonToString(obj: Record<string, string> | undefined): string {
  return JSON.stringify(obj, null, 2);
};

export function stringToJson(value: string): Record<string, string> {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) return {};
  try {
    return JSON.parse(trimmedValue);
  } catch {
    return {};
  }
};

export function isValidJSON(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
};
