import { expect, describe, it, beforeEach } from 'vitest';
import { RangeBlobsCache, CachedFileRange } from './range_blobs_cache';
import { genWholeFile, genRangeFile } from './test_helpers';

/** Functions-generators for tests.*/

const genCache = (
  softSizeBytes: number,
  totalSizeBytes: number,
  keyToFile: CachedFileRange[],
  baseKeyToFiles: Record<string, string[]>
): RangeBlobsCache => {
  const cache = new RangeBlobsCache(softSizeBytes);
  cache.totalSizeBytes = totalSizeBytes;
  cache.keyToFile = new Map(keyToFile.map((f) => [f.key, f]));
  cache.baseKeyToFiles = new Map(Object.entries(baseKeyToFiles));

  return cache;
};

describe('RangeBlobsCache.exists', () => {
  it('should false when no files', () => {
    const cache = genCache(1000, 1000, [], {});
    expect(cache.exists('file', { from: 0, to: 100 })).toBe(false);
  });

  it('should ok when whole file', () => {
    const f = genWholeFile('test/path', 'file', 100);
    const cache = genCache(1000, 100, [f], { [f.baseKey]: [f.key] });

    expect(cache.exists('file', undefined)).toBe(true);
  });

  it('should ok when whole file and range', () => {
    const f = genWholeFile('test/path', 'file', 100);
    const cache = genCache(
      1000, 100, [f],
      { [f.baseKey]: [f.key] },
    );

    expect(cache.exists(`file`, { from: 0, to: 100 })).toBe(true);
  });

  it('should ok when range file and range', () => {
    const f = genRangeFile('test/path', 'file', { from: 0, to: 200 });
    const cache = genCache(1000, 100, [f], { [f.baseKey]: [f.key] });

    expect(cache.exists('file', { from: 50, to: 150 })).toBe(true);
  });

  it('should ok when no ranges contains range', () => {
    const f = genRangeFile('test/path', 'file', { from: 100, to: 200 });
    const cache = genCache(1000, 100, [f], { [f.baseKey]: [f.key] });

    expect(cache.exists('file', { from: 100, to: 250 })).toBe(false);
    expect(cache.exists('file', { from: 0, to: 50 })).toBe(false);
  });

  it('should ok when one range contains range', () => {
    const f1 = genRangeFile('test/path', 'file', { from: 0, to: 100 });
    const f2 = genRangeFile('test/path', 'file', { from: 200, to: 300 });
    const cache = genCache(
      1000, 100,
      [f1, f2],
      { [f1.baseKey]: [f1.key, f2.key] },
    );

    expect(cache.exists('file', { from: 50, to: 100 })).toBe(true);
    expect(cache.exists('file', { from: 200, to: 250 })).toBe(true);
    expect(cache.exists('file', { from: 150, to: 180 })).toBe(false);
  });
});

describe('RangeBlobsCache.toDelete', () => {
  it('should none when no files', () => {
    const cache = genCache(1000, 500, [], {});
    expect(cache.toDelete()).toEqual([]);
  });

  it('should none when greater then soft limit but no zero counters', () => {
    const f1 = genRangeFile('test/path', 'file1', { from: 0, to: 100 }, 1);
    const cache = genCache(50, 100, [f1], { [f1.baseKey]: [f1.key] });

    expect(cache.toDelete()).toEqual([]);
  });

  it('should ok when greater then soft limit and zero counters', () => {
    const f1 = genRangeFile('test/path', 'file1', { from: 0, to: 100 });
    const f2 = genRangeFile('test/path', 'file2', { from: 0, to: 200 }, 1);
    const cache = genCache(250, 350, [f1, f2], {
      [f1.baseKey]: [f1.key],
      [f2.baseKey]: [f2.key],
    });

    const toDelete = cache.toDelete();

    expect(toDelete).toEqual([f1]);
  });

  it('should ok when greter then soft limint and lots of zero counters', () => {
    const f1 = genRangeFile('test/path', 'file1', { from: 0, to: 60 });
    const f2 = genRangeFile('test/path', 'file2', { from: 0, to: 200 }, 1);
    const f3 = genRangeFile('test/path', 'file3', { from: 0, to: 70 });
    const cache = genCache(200, 60 + 200 + 70, [f1, f2, f3], {
      [f1.baseKey]: [f1.key],
      [f2.baseKey]: [f2.key],
      [f3.baseKey]: [f3.key],
    });

    const toDelete = cache.toDelete();

    expect(toDelete.sort()).toEqual([f1, f3]);
  });

  it('should none when files with non-zero counters', () => {
    const f1 = genRangeFile('test/path', 'file1', { from: 0, to: 100 }, 1);

    const cache = genCache(50, 100, [f1], { [f1.baseKey]: [f1.key] });

    expect(cache.toDelete()).toEqual([]);
  });
});
