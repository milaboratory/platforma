import { describe, it, expect } from 'vitest';
import { CSet } from './cset';

describe('CSet', () => {
  it('should add and check for primitive values', () => {
    const set = new CSet<string | number>();
    set.add('a');
    set.add(1);
    expect(set.has('a')).toBe(true);
    expect(set.has(1)).toBe(true);
    expect(set.has('b')).toBe(false);
    expect(set.size).toBe(2);
  });

  it('should add and check for object values', () => {
    const set = new CSet<object>();
    const val1 = { id: 1, name: 'foo' };
    const val1Equivalent = { name: 'foo', id: 1 };
    const val2 = { id: 2, name: 'bar' };

    set.add(val1);
    expect(set.has(val1)).toBe(true);
    expect(set.has(val1Equivalent)).toBe(true);
    expect(set.size).toBe(1);

    set.add(val1Equivalent); // Adding equivalent object should not increase size
    expect(set.size).toBe(1);

    set.add(val2);
    expect(set.has(val2)).toBe(true);
    expect(set.size).toBe(2);
  });

  it('should handle null and undefined values', () => {
    const set = new CSet<any>();
    set.add(null);
    set.add(undefined);

    expect(set.has(null)).toBe(true);
    expect(set.has(undefined)).toBe(true);
    expect(set.size).toBe(2);

    set.add(null); // Adding again should not change size
    expect(set.size).toBe(2);
  });

  it('should report correct size', () => {
    const set = new CSet<object>();
    expect(set.size).toBe(0);
    set.add({ a: 1 });
    expect(set.size).toBe(1);
    set.add({ b: 2 });
    expect(set.size).toBe(2);
    set.add({ a: 1 }); // Add equivalent object
    expect(set.size).toBe(2);
  });

  it('should delete values', () => {
    const set = new CSet<any>();
    const val1 = { id: 'x' };
    set.add(val1);
    set.add('val2');
    set.add(null);

    expect(set.delete(val1)).toBe(true);
    expect(set.has(val1)).toBe(false);
    expect(set.size).toBe(2);

    expect(set.delete({ id: 'x' })).toBe(false); // Already deleted

    expect(set.delete(null)).toBe(true);
    expect(set.has(null)).toBe(false);
    expect(set.size).toBe(1);

    expect(set.delete('nonExistent')).toBe(false);
  });

  it('should clear the set', () => {
    const set = new CSet<string>();
    set.add('a');
    set.add('b');
    set.clear();
    expect(set.size).toBe(0);
    expect(set.has('a')).toBe(false);
  });

  it('should iterate with values(), keys(), entries(), and [Symbol.iterator]', () => {
    const set = new CSet<object | string>();
    const valObj1 = { name: 'obj1' };
    const valObj2 = { name: 'obj2' };
    
    // original value instances for assertion
    const origValObj1 = valObj1;
    const origValObj2 = valObj2;
    const origValStr = 'strVal';

    set.add(origValObj1);
    set.add(origValStr);
    set.add(origValObj2);

    // Test values() and [Symbol.iterator]()
    const values = Array.from(set.values());
    expect(values).toEqual([origValObj1, origValStr, origValObj2]);
    expect(values[0]).toBe(origValObj1); // Check instance

    const iteratedValues: Array<object|string> = [];
    for (const value of set) {
      iteratedValues.push(value);
    }
    expect(iteratedValues).toEqual([origValObj1, origValStr, origValObj2]);
    expect(iteratedValues[0]).toBe(origValObj1);

    // Test keys()
    const keys = Array.from(set.keys());
    expect(keys).toEqual([origValObj1, origValStr, origValObj2]);
    expect(keys[0]).toBe(origValObj1);

    // Test entries() - User modified this to return IterableIterator<T>
    const entries = Array.from(set.entries());
    expect(entries).toEqual([origValObj1, origValStr, origValObj2]);
    expect(entries[0]).toBe(origValObj1);
  });

  it('should execute forEach callback with correct arguments (value, value, set)', () => {
    const set = new CSet<object>();
    const valA = { type: 'A' };
    const valB = { type: 'B' };
    set.add(valA);
    set.add(valB);

    const result: Array<{ v1: object, v2: object, s: CSet<object> }> = [];
    set.forEach((value, value2, s) => {
      result.push({ v1: value, v2: value2, s: s });
    });

    expect(result.length).toBe(2);
    expect(result[0].v1).toBe(valA); // Check original instance
    expect(result[0].v2).toBe(valA);
    expect(result[0].s).toBe(set);
    expect(result[1].v1).toBe(valB);
    expect(result[1].v2).toBe(valB);
    expect(result[1].s).toBe(set);
  });

  it('should maintain insertion order', () => {
    const set = new CSet<string>();
    set.add('first');
    set.add('second');
    set.add('third');
    set.delete('second');
    set.add('fourth');
    set.add('first'); // Add existing

    expect(Array.from(set.values())).toEqual(['first', 'third', 'fourth']);
  });

  it('should return the most recent value instance for canonically equivalent values on add', () => {
    const set = new CSet<object>();
    const valOriginal = { id: 1, data: 'content', config: { type: 'A' } };
    // Canonically the same as valOriginal, but a different instance:
    const valUpdateInstance = { data: 'content', id: 1, config: { type: 'A' } };

    set.add(valOriginal);
    // Test has() with a new, canonically equivalent object
    expect(set.has({ id: 1, data: 'content', config: { type: 'A' } })).toBe(true);
    expect(set.has({ data: 'content', config: { type: 'A' }, id: 1 })).toBe(true);

    let currentValues = Array.from(set.values());
    expect(currentValues[0]).toBe(valOriginal); // The original instance is stored
    expect(set.size).toBe(1);

    set.add(valUpdateInstance); // Add a new instance of a canonically equivalent value
    expect(set.has({ id: 1, data: 'content', config: { type: 'A' } })).toBe(true);
    expect(set.size).toBe(1); // Size should remain 1

    currentValues = Array.from(set.values());
    // The valueMap should now store valUpdateInstance
    expect(currentValues[0]).toBe(valUpdateInstance);
  });

});
