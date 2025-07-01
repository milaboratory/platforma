import { describe, it, expect } from 'vitest';
import { compare, applyPatch } from 'fast-json-patch';

describe('json patch test', () => {
  it('should work', async () => {
    const oldState = { foo: 1, bar: { baz: 3 } };
    const newState = { ...oldState, bar: { baz: 4, qux: 5 } };

    const patch = compare(oldState, newState);

    console.log(patch);
    expect(patch).toEqual([
      { op: 'replace', path: '/bar/baz', value: 4 },
      { op: 'add', path: '/bar/qux', value: 5 },
    ]);

    const result = applyPatch(oldState, patch).newDocument;

    expect(result).toEqual(newState);
  });
});
