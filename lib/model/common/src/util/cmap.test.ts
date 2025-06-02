import { describe, it, expect } from 'vitest';
import { CMap } from './cmap';

describe('CMap', () => {
  it('should set and get values with primitive keys', () => {
    const map = new CMap<string | number, string>();
    map.set('a', 'alpha');
    map.set(1, 'one');
    expect(map.get('a')).toBe('alpha');
    expect(map.get(1)).toBe('one');
    expect(map.size).toBe(2);
  });

  it('should set and get values with object keys', () => {
    const map = new CMap<object, string>();
    const key1 = { id: 1, name: 'foo' };
    const key1Equivalent = { name: 'foo', id: 1 }; // Order shouldn't matter for canonicalize
    const key2 = { id: 2, name: 'bar' };

    map.set(key1, 'value1');
    expect(map.get(key1)).toBe('value1');
    expect(map.get(key1Equivalent)).toBe('value1');
    expect(map.size).toBe(1);

    map.set(key2, 'value2');
    expect(map.get(key2)).toBe('value2');
    expect(map.size).toBe(2);
  });

  it('should handle null and undefined keys', () => {
    const map = new CMap<any, string>();
    map.set(null, 'valueForNull');
    map.set(undefined, 'valueForUndefined');

    expect(map.get(null)).toBe('valueForNull');
    expect(map.get(undefined)).toBe('valueForUndefined');
    expect(map.size).toBe(2);

    map.set(null, 'newValueForNull');
    expect(map.get(null)).toBe('newValueForNull');
    expect(map.size).toBe(2); // Size should not change, value updated
  });

  it('should report correct size', () => {
    const map = new CMap<object, number>();
    expect(map.size).toBe(0);
    map.set({ a: 1 }, 100);
    expect(map.size).toBe(1);
    map.set({ b: 2 }, 200);
    expect(map.size).toBe(2);
    map.set({ a: 1 }, 300); // Override existing key
    expect(map.size).toBe(2);
  });

  it('should check for key existence with has()', () => {
    const map = new CMap<any, string>();
    const objKey = { complex: { nested: true } };
    map.set('a', 'stringA');
    map.set(objKey, 'objectValue');
    map.set(null, 'nullValue');

    expect(map.has('a')).toBe(true);
    expect(map.has({ complex: { nested: true } })).toBe(true);
    expect(map.has(null)).toBe(true);
    expect(map.has(undefined)).toBe(false);
    map.set(undefined, 'undefVal');
    expect(map.has(undefined)).toBe(true);

    expect(map.has('b')).toBe(false);
    expect(map.has({ complex: { nested: false } })).toBe(false);
  });

  it('should delete keys', () => {
    const map = new CMap<any, number>();
    const key1 = { id: 'x' };
    map.set(key1, 1);
    map.set('key2', 2);
    map.set(null, 0);

    expect(map.delete(key1)).toBe(true);
    expect(map.has(key1)).toBe(false);
    expect(map.size).toBe(2);

    expect(map.delete({ id: 'x' })).toBe(false); // Already deleted

    expect(map.delete(null)).toBe(true);
    expect(map.has(null)).toBe(false);
    expect(map.size).toBe(1);

    expect(map.delete('nonExistent')).toBe(false);
  });

  it('should clear the map', () => {
    const map = new CMap<string, string>();
    map.set('a', '1');
    map.set('b', '2');
    map.clear();
    expect(map.size).toBe(0);
    expect(map.has('a')).toBe(false);
    expect(map.get('b')).toBeUndefined();
  });

  it('should iterate with keys(), values(), entries(), and [Symbol.iterator]', () => {
    const map = new CMap<object | string, number>();
    const keyObj1 = { name: 'obj1' };
    const keyObj2 = { name: 'obj2' };

    // original key instances for assertion
    const origKeyObj1 = keyObj1;
    const origKeyObj2 = keyObj2;
    const origKeyStr = 'strKey';

    map.set(origKeyObj1, 10);
    map.set(origKeyStr, 20);
    map.set(origKeyObj2, 30);
    
    // Test keys()
    const keys = Array.from(map.keys());
    expect(keys).toEqual([origKeyObj1, origKeyStr, origKeyObj2]);
    expect(keys[0]).toBe(origKeyObj1); // Check instance
    expect(keys[2]).toBe(origKeyObj2);

    // Test values()
    const values = Array.from(map.values());
    expect(values).toEqual([10, 20, 30]);

    // Test entries() and [Symbol.iterator]()
    const entries = Array.from(map.entries());
    expect(entries).toEqual([[origKeyObj1, 10], [origKeyStr, 20], [origKeyObj2, 30]]);
    expect(entries[0][0]).toBe(origKeyObj1);
    expect(entries[2][0]).toBe(origKeyObj2);

    const iteratedEntries: Array<[object | string, number]> = [];
    for (const entry of map) {
      iteratedEntries.push(entry);
    }
    expect(iteratedEntries).toEqual([[origKeyObj1, 10], [origKeyStr, 20], [origKeyObj2, 30]]);
    expect(iteratedEntries[0][0]).toBe(origKeyObj1);
  });

  it('should execute forEach callback with correct arguments', () => {
    const map = new CMap<object, string>();
    const keyA = { type: 'a' };
    const keyB = { type: 'b' };
    map.set(keyA, 'valA');
    map.set(keyB, 'valB');

    const result: Array<{ v: string, k: object, m: CMap<object, string> }> = [];
    map.forEach((value, key, m) => {
      result.push({ v: value, k: key, m: m });
    });

    expect(result.length).toBe(2);
    expect(result[0].v).toBe('valA');
    expect(result[0].k).toBe(keyA); // check original key instance
    expect(result[0].m).toBe(map);
    expect(result[1].v).toBe('valB');
    expect(result[1].k).toBe(keyB);
    expect(result[1].m).toBe(map);
  });

   it('should maintain insertion order', () => {
    const map = new CMap<string, number>();
    map.set('first', 1);
    map.set('second', 2);
    map.set('third', 3);
    map.delete('second');
    map.set('fourth', 4);
    map.set('first', 1.1); // Update existing

    expect(Array.from(map.keys())).toEqual(['first', 'third', 'fourth']);
    expect(Array.from(map.values())).toEqual([1.1, 3, 4]);
    expect(Array.from(map.entries())).toEqual([['first', 1.1], ['third', 3], ['fourth', 4]]);
  });

  it('should return the most recent key instance for canonically equivalent keys', () => {
    const map = new CMap<object, string>();
    const keyOriginal = { id: 1, data: 'original', nested: { order: 'irrelevant'} };
    // Canonically the same as keyOriginal due to key sorting, but a different instance:
    const keyUpdateInstance = { data: 'original', nested: { order: 'irrelevant'}, id: 1 };

    map.set(keyOriginal, "value1");
    // Test getting with a new, canonically equivalent object
    expect(map.get({ id: 1, data: 'original', nested: { order: 'irrelevant'} })).toBe("value1");
    expect(map.get({ data: 'original', id: 1, nested: { order: 'irrelevant'} })).toBe("value1");

    let currentKeys = Array.from(map.keys());
    expect(currentKeys[0]).toBe(keyOriginal); // The original instance is stored
    expect(map.size).toBe(1);

    map.set(keyUpdateInstance, "value2"); // Update with a new instance for the same canonical key
    expect(map.get({ id: 1, data: 'original', nested: { order: 'irrelevant'} })).toBe("value2"); // Value should be updated
    expect(map.size).toBe(1); // Size should remain 1

    currentKeys = Array.from(map.keys());
    // The keyMap should now store keyUpdateInstance for this canonical key
    expect(currentKeys[0]).toBe(keyUpdateInstance);
  });

});
