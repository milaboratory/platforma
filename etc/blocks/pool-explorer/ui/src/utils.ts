import { isPlainObject } from '@milaboratories/helpers';

export function containsValue<T = unknown>(obj: T, options: {
  search: string;
  withKeys: boolean;
  caseSensitive: boolean;
}): boolean {
  const { search, withKeys, caseSensitive } = options;

  const matchString = caseSensitive
    ? (k: string) => String(k).includes(search)
    : (k: string) => String(k).toLocaleLowerCase().includes(search.toLocaleLowerCase());

  if (Array.isArray(obj)) {
    return obj.some((it) => containsValue(it, options));
  } else if (isPlainObject(obj)) {
    const matchKey = withKeys ? matchString : () => false;
    return Object.keys(obj).some((k) => containsValue(obj[k], options) || matchKey(k));
  } else {
    return matchString(String(obj));
  }
}
