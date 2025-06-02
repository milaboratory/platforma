import { getCanonicalString } from './common';

/**
 * A Set-like class that uses canonical string representations for its values.
 * This allows for the storage of complex objects, ensuring that structurally
 * identical objects (after canonicalization) are treated as equivalent for set membership,
 * overcoming JavaScript's default reference-based equality for objects in Sets.
 * Implements the standard ES6 Set interface.
 */
export class CSet<T> {
  private valueMap: Map<string, T> = new Map(); // Stores canonical string -> original value

  get size(): number {
    return this.valueMap.size;
  }

  add(value: T): this {
    const cValue = getCanonicalString(value);
    this.valueMap.set(cValue, value);
    return this;
  }

  has(value: T): boolean {
    const cValue = getCanonicalString(value);
    return this.valueMap.has(cValue);
  }

  delete(value: T): boolean {
    const cValue = getCanonicalString(value);
    return this.valueMap.delete(cValue);
  }

  clear(): void {
    this.valueMap.clear();
  }

  values(): IterableIterator<T> {
    return this.valueMap.values();
  }

  keys(): IterableIterator<T> {
    return this.values();
  }

  entries(): IterableIterator<T> {
    const valueIterator = this.values();
    return (function*() {
      for (const value of valueIterator) {
        yield value;
      }
    })();
  }

  forEach(callbackfn: (value: T, value2: T, set: CSet<T>) => void, thisArg?: any): void {
    for (const value of this.values()) {
      callbackfn.call(thisArg, value, value, this);
    }
  }

  [Symbol.iterator](): IterableIterator<T> {
    return this.values();
  }
}
