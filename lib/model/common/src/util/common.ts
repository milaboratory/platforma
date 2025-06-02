import canonicalize from 'canonicalize';

export const NULL_VALUE_STRING = '__CMAP_NULL_INTERNAL__';
export const UNDEFINED_VALUE_STRING = '__CMAP_UNDEFINED_INTERNAL__';

export function getCanonicalString<T>(value: T): string {
  if (value === null) {
    return NULL_VALUE_STRING;
  }
  if (value === undefined) {
    return UNDEFINED_VALUE_STRING;
  }
  return canonicalize(value)!;
}
