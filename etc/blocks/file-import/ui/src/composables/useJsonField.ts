export function useJsonField() {
  const jsonToString = (obj: Record<string, string> | undefined): string => {
    if (!obj || Object.keys(obj).length === 0) return '';
    return JSON.stringify(obj, null, 2);
  };

  const stringToJson = (value: string): Record<string, string> => {
    if (!value.trim()) return {};
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  };

  const isValidJSON = (value: string): boolean => {
    if (!value.trim()) return true;
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  };

  return {
    jsonToString,
    stringToJson,
    isValidJSON
  };
}
