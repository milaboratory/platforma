import { getCanonicalString, NULL_VALUE_STRING, UNDEFINED_VALUE_STRING } from './common';

/**
 * A Map-like class that uses canonical string representations for its keys.
 * This allows for the use of complex objects as keys, ensuring that structurally
 * identical objects (after canonicalization) are treated as equivalent, overcoming
 * JavaScript's default reference-based equality for object keys in Maps.
 * Implements the standard ES6 Map interface.
 */
export class CMap<K, V> {
  private dataMap: Map<string, V> = new Map();
  private keyMap: Map<string, K> = new Map();

  get size(): number {
    return this.dataMap.size;
  }

  set(key: K, value: V): this {
    const cKey = getCanonicalString(key);
    this.dataMap.set(cKey, value);
    this.keyMap.set(cKey, key);
    return this;
  }

  get(key: K): V | undefined {
    const cKey = getCanonicalString(key);
    return this.dataMap.get(cKey);
  }

  has(key: K): boolean {
    const cKey = getCanonicalString(key);
    return this.dataMap.has(cKey);
  }

  delete(key: K): boolean {
    const cKey = getCanonicalString(key);
    this.keyMap.delete(cKey);
    return this.dataMap.delete(cKey);
  }

  clear(): void {
    this.dataMap.clear();
    this.keyMap.clear();
  }

  keys(): IterableIterator<K> {
    return this.keyMap.values();
  }

  values(): IterableIterator<V> {
    return this.dataMap.values();
  }

  entries(): IterableIterator<[K, V]> {
    const dataEntries = this.dataMap.entries();
    const keyMap = this.keyMap;
    return (function*() {
      for (const [cKey, value] of dataEntries) {
        const originalKey = keyMap.get(cKey);
        if (cKey === NULL_VALUE_STRING) {
          yield [null as any as K, value];
        } else if (cKey === UNDEFINED_VALUE_STRING) {
          yield [undefined as any as K, value];
        } else if (originalKey !== undefined) {
          yield [originalKey, value];
        } else {
          throw new Error(`CMap: Original key not found for canonical key: ${cKey} and it's not a special null/undefined key.`);
        }
      }
    })();
  }

  forEach(callbackfn: (value: V, key: K, map: CMap<K, V>) => void, thisArg?: any): void {
    for (const [key, value] of this.entries()) {
      callbackfn.call(thisArg, value, key, this);
    }
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.entries();
  }
}
