import { getIncrementalId } from './uniqId';

export function hashString(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed,
    h2 = 0x41c6ce57 ^ seed;

  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}


export function shallowHash(...values: unknown[]): number {
  let str = '';

  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];

    if (value === undefined) {
      str += '/undefined';
    } else if (value === null) {
      str += '/null';
    } else if (typeof value === 'object' || typeof value === 'function') {
      str += '/' + getIdForPointer(value as object);
    } else {
      // don't forget about value == empty string
      str += '/' + String(value);
    }
  }

  return hashString(str);
}

const mapPointerToMap = new WeakMap<object, string>();

function getIdForPointer(obj: object | ((...args: unknown[]) => unknown)): string {
  if (!mapPointerToMap.has(obj)) {
    mapPointerToMap.set(obj, getIncrementalId());
  }

  return mapPointerToMap.get(obj)!;
}
