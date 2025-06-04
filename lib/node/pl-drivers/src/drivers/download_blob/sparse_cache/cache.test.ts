import { SparseCache, type SparseFile, type SparseCacheRanges } from './cache';
import { ConsoleLoggerAdapter } from '@milaboratories/ts-helpers';
import type { Ranges } from './ranges';
import { describe, it, expect } from 'vitest';

/** gen helpers */

/** Generates Uint8Array from string. */
function genData(string: string) {
  const enc = new TextEncoder();
  return enc.encode(string);
}

/** Converts uint 8 array to string. */
function toString(arr: Uint8Array) {
  const dec = new TextDecoder();
  return dec.decode(arr);
}

/** In-memory implementation for cache ranges. */
class InMemoryRanges implements SparseCacheRanges {
  constructor(
    public readonly keyToRanges: Record<string, Ranges>,
  ) {}

  async get(key: string) {
    const result = this.keyToRanges[key];
    return result ?? { ranges: [] };
  }

  async set(key: string, ranges: Ranges) {
    this.keyToRanges[key] = ranges;
  }

  async delete(key: string) {
    delete this.keyToRanges[key];
  }
}

/** In-memory implementation for a sparse file. */
class InMemoryFile implements SparseFile {
  constructor(
    public readonly keyToFromToData: Record<string, Record<number, string>>,
  ) {}

  async exists(key: string) {
    return key in this.keyToFromToData;
  }

  path(key: string) {
    return key;
  }

  async write(key: string, data: Uint8Array, from: number) {
    this.keyToFromToData[key] = this.keyToFromToData[key] ?? {};
    this.keyToFromToData[key][from] = toString(data);
  }

  async delete(key: string) {
    delete this.keyToFromToData[key];
  }
}

function genCache(
  keyToLastAccessTime: Record<string, Date>,
  size: number,
  maxSize: number,
  ranges: Record<string, Ranges>,
  storage: Record<string, Record<number, string>>,
): {
  cache: SparseCache,
  ranges: InMemoryRanges,
  storage: InMemoryFile,
} {
  const inMemRanges = new InMemoryRanges(ranges);
  const inMemStorage = new InMemoryFile(storage);

  const c = new SparseCache(
    new ConsoleLoggerAdapter(),
    maxSize,
    inMemRanges,
    inMemStorage,
  );
  c.keyToLastAccessTime = new Map(Object.entries(keyToLastAccessTime));
  c.size = size;

  return {
    cache: c,
    ranges: inMemRanges,
    storage: inMemStorage,
  };
}

/** Tests */

describe('SparseCache.get', () => {
  const cases: {
    name: string;
    initialCache: SparseCache;
    key: string;
    range: { from: number; to: number };
    expectedPath?: string;
  }[] = [
      {
        name: 'key does not exist in storage',
        initialCache: genCache({}, 0, 100, {}, {}).cache,
        key: 'key1',
        range: { from: 0, to: 10 },
        expectedPath: undefined,
      },
      {
        name: 'key exists, but range does not exist in cache',
        initialCache: genCache(
          { 'key1': new Date() },
          10,
          100,
          { 'key1': { ranges: [{ from: 0, to: 10 }] } },
          { 'key1': { 0: 'data' } },
        ).cache,
        key: 'key1',
        range: { from: 5, to: 15 },
        expectedPath: undefined,
      },
      {
        name: 'key exists, and exact range exists in cache',
        initialCache: genCache(
          { 'key1': new Date() },
          10,
          100,
          { 'key1': { ranges: [{ from: 0, to: 10 }] } },
          { 'key1': { 0: 'data' } },
        ).cache,
        key: 'key1',
        range: { from: 0, to: 10 },
        expectedPath: 'key1',
      },
      {
        name: 'key exists, and sub-range exists in cache',
        initialCache: genCache(
          { 'key1': new Date() },
          20,
          100,
          { 'key1': { ranges: [{ from: 0, to: 20 }] } },
          { 'key1': { 0: 'data' } },
        ).cache,
        key: 'key1',
        range: { from: 5, to: 15 },
        expectedPath: 'key1',
      },
    ];

  for (const tc of cases) {
    it(tc.name, async () => {
      const result = await tc.initialCache.get(tc.key, tc.range);

      expect(result).toEqual(tc.expectedPath);
    });
  }
});

describe('SparseCache.setNoClear', () => {
  it('should add a new key and range', async () => {
    const c = genCache(
      {},
      0,
      100,
      {},
      {},
    );

    await c.cache.setNoClear('key1', { from: 0, to: 10 }, genData('abc123abc1'));

    expect(c.ranges.keyToRanges).toMatchObject({
      'key1': { ranges: [{ from: 0, to: 10 }] },
    });
    expect(c.storage.keyToFromToData).toMatchObject({
      'key1': { 0: 'abc123abc1' },
    });
    expect(c.cache.size).toEqual(10);
  });

  it('should overwrite data when adding the same key and range', async () => {
    const c = genCache(
      { 'key1': new Date(Date.now() - 1000) },
      10,
      100,
      { 'key1': { ranges: [{ from: 0, to: 10 }] } },
      { 'key1': { 0: 'data' } },
    );

    await c.cache.setNoClear('key1', { from: 0, to: 10 }, genData('abc123abc1'));

    expect(c.ranges.keyToRanges).toMatchObject({
      'key1': { ranges: [{ from: 0, to: 10 }] },
    });
    expect(c.storage.keyToFromToData).toMatchObject({
      'key1': { 0: 'abc123abc1' },
    });
    expect(c.cache.size).toEqual(10);
  });

  it('should add a new non-overlapping range to an existing key', async () => {
    const c = genCache(
      { 'key1': new Date(Date.now() - 10000) },
      10,
      100,
      { 'key1': { ranges: [{ from: 0, to: 10 }] } },
      { 'key1': { 0: 'original  ' } } // 10 chars
    );

    await c.cache.setNoClear('key1', { from: 20, to: 30 }, genData('new       ')); // 10 chars

    expect(c.ranges.keyToRanges['key1']).toEqual({ ranges: [{ from: 0, to: 10 }, { from: 20, to: 30 }] });
    expect(c.storage.keyToFromToData['key1']).toMatchObject({
      0: 'original  ',
      20: 'new       '
    });
    expect(c.cache.size).toEqual(20); // 10 for original + 10 for new
  });

  it('should add an overlapping range and merge with existing range', async () => {
    const c = genCache(
      { 'key1': new Date(Date.now() - 10000) },
      10,
      100,
      { 'key1': { ranges: [{ from: 0, to: 10 }] } }, // 0-10
      { 'key1': { 0: 'original  ' } }      // data for 0-10
    );

    // Add range 5-15, overlaps with 0-10
    await c.cache.setNoClear('key1', { from: 5, to: 15 }, genData('nal1231231')); // data for 5-15

    expect(c.ranges.keyToRanges['key1']).toEqual({ ranges: [{ from: 0, to: 15 }] });
    expect(c.storage.keyToFromToData['key1']).toMatchObject({
      0: 'original  ',
      5: 'nal1231231'
    });
    expect(c.cache.size).toEqual(15); // Size of merged range 0-15
  });

  it('should update size correctly when ranges are modified (subsumed range)', async () => {
    const c = genCache(
      { 'key1': new Date() },
      20,
      100,
      { 'key1': { ranges: [{ from: 0, to: 20 }] } },
      { 'key1': { 0: 'longoriginaldata    ' } }
    );

    // Add range 5-15, which is a sub-range of 0-20. The total range 0-20 should remain.
    // The size should remain 20 as normalizeRanges will keep the outer [0, 20] range.
    await c.cache.setNoClear('key1', { from: 5, to: 15 }, genData('subrange  '));

    expect(c.cache.size).toEqual(20);
    expect(c.ranges.keyToRanges['key1']).toEqual({ ranges: [{ from: 0, to: 20 }] });
    expect(c.storage.keyToFromToData['key1']).toMatchObject({
      0: 'longoriginaldata    ',
      5: 'subrange  '
    });
  });
});

describe('SparseCache.ensureCleared', () => {
  it('should do nothing if cache size is below or equal to maxSize', async () => {
    const c = genCache(
      {
        'key1': new Date(2023, 0, 1, 10, 0, 0), // oldest
        'key2': new Date(2023, 0, 1, 11, 0, 0), // newest
      },
      20,
      30,
      {
        'key1': { ranges: [{ from: 0, to: 10 }] },
        'key2': { ranges: [{ from: 0, to: 10 }] },
      },
      {
        'key1': { 0: 'data1' },
        'key2': { 0: 'data2' },
      }
    );

    await c.cache.ensureCleared();

    expect(c.cache.size).toEqual(20);
    expect(c.ranges.keyToRanges).toMatchObject({
      'key1': { ranges: [{ from: 0, to: 10 }] },
      'key2': { ranges: [{ from: 0, to: 10 }] },
    });
    expect(c.storage.keyToFromToData).toMatchObject({
      'key1': { 0: 'data1' },
      'key2': { 0: 'data2' },
    });
  });

  it('should evict the oldest item(s) if cache size is above maxSize', async () => {
    const c = genCache(
      {
        'key1': new Date(2023, 0, 1, 10, 0, 0),
        'key2': new Date(2023, 0, 1, 11, 0, 0),
        'key3': new Date(2023, 0, 1, 12, 0, 0),
      },
      41,
      25,
      {
        'key1': { ranges: [{ from: 0, to: 11 }] },
        'key2': { ranges: [{ from: 0, to: 20 }] },
        'key3': { ranges: [{ from: 0, to: 10 }] },
      },
      {
        'key1': { 0: 'data1' },
        'key2': { 0: 'data2' },
        'key3': { 0: 'data3' },
      }
    );

    await c.cache.ensureCleared();

    expect(c.cache.size).toEqual(10);
    expect(c.ranges.keyToRanges).toMatchObject({
      'key3': { ranges: [{ from: 0, to: 10 }] },
    });
    expect(c.storage.keyToFromToData).toMatchObject({
      'key3': { 0: 'data3' },
    });
  });

  it('should evict all items if necessary to meet maxSize (e.g., maxSize is 0)', async () => {
    const c = genCache(
      {
        'key1': new Date(2023, 0, 1, 10, 0, 0),
        'key2': new Date(2023, 0, 1, 11, 0, 0),
      },
      30, // size = 10 (key1) + 20 (key2)
      0,  // maxSize
      {
        'key1': { ranges: [{ from: 0, to: 10 }] },
        'key2': { ranges: [{ from: 0, to: 20 }] },
      },
      {
        'key1': { 0: 'data1' },
        'key2': { 0: 'data2' },
      }
    );

    await c.cache.ensureCleared();

    expect(c.cache.size).toEqual(0);
    expect(Object.keys(c.ranges.keyToRanges).length).toEqual(0);
    expect(Object.keys(c.storage.keyToFromToData).length).toEqual(0);
  });

  it('should handle an empty cache initially', async () => {
    const c = genCache(
      {},
      0,
      10,
      {},
      {}
    );

    await c.cache.ensureCleared();

    expect(c.cache.size).toEqual(0);
    expect(Object.keys(c.ranges.keyToRanges).length).toEqual(0);
    expect(Object.keys(c.storage.keyToFromToData).length).toEqual(0);
  });
});
