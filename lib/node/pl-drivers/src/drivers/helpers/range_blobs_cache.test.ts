import { expect, describe, it, beforeEach } from 'vitest';
import { CallersCounter } from '@milaboratories/ts-helpers';
import { RangeBlobsCache, WholeFile, CachedFile, RangeFile, RangeBytes } from './range_blobs_cache';

/** Functions-generators for tests.*/

const genWholeFile = (basePath: string, size: number): WholeFile => {
  return {
    type: 'whole',
    size,
    path: basePath + '.txt',
    basePath: basePath,
    counter: new CallersCounter(),
  };
};

const genRangeFile = (basePath: string, range: RangeBytes): RangeFile => {
  return {
    type: 'range',
    size: range.to - range.from,
    path: basePath + `_${range.from}-${range.to}.txt`,
    basePath: basePath,
    range,
    counter: new CallersCounter(),
  };
};

const genCache = (
  softSizeBytes: number,
  totalSizeBytes: number,
  pathToFile: CachedFile[],
  basePathToFiles: Record<string, string[]>
): RangeBlobsCache => {
  const cache = new RangeBlobsCache(softSizeBytes);
  cache.totalSizeBytes = totalSizeBytes;
  cache.pathToFile = new Map(pathToFile.map((f) => [f.path, f]));
  cache.basePathToFiles = new Map(Object.entries(basePathToFiles));

  return cache;
};

describe('RangeBlobsCache.existsWholeFile', () => {
  it('should return false if the file does not exist', () => {
    const cache = genCache(1000, 1000, [], {});
    expect(cache.existsWholeFile('test/path/file.txt')).toBe(false);
  });

  it('should ok when a whole file exists in the cache', () => {
    const f = genWholeFile('test/path/file', 100);
    const cache = genCache(1000, 100, [f], { [f.basePath]: [f.path] });

    expect(cache.existsWholeFile('test/path/file.txt')).toBe(true);
  });
});

describe('RangeBlobsCache.exists', () => {
  it('should return false if no files exist for the base path', () => {
    const cache = genCache(1000, 1000, [], {});
    expect(cache.exists('test/path', { from: 0, to: 100 })).toBe(false);
  });

  it('should return true if a whole file exists for the base path', () => {
    const f = genWholeFile('test/path/file', 100);
    const cache = genCache(
      1000, 100, [f],
      { [f.basePath]: [f.path] },
    );

    expect(cache.exists(`test/path/file`, { from: 0, to: 100 })).toBe(true);
  });

  it('should return true if a range file exists that contains the requested range', () => {
    const f = genRangeFile('test/path/file', { from: 0, to: 200 });
    const cache = genCache(1000, 100, [f], { [f.basePath]: [f.path] });

    expect(cache.exists('test/path/file', { from: 50, to: 150 })).toBe(true);
  });

  it('should return false if no range file contains the requested range', () => {
    const f = genRangeFile('test/path/file', { from: 100, to: 200 });
    const cache = genCache(1000, 100, [f], { [f.basePath]: [f.path] });

    expect(cache.exists('test/path/file', { from: 100, to: 250 })).toBe(false);
    expect(cache.exists('test/path/file', { from: 0, to: 50 })).toBe(false);
  });

  it('should return true if one of multiple files contains the requested range', () => {
    const f1 = genRangeFile('test/path/file', { from: 0, to: 100 });
    const f2 = genRangeFile('test/path/file', { from: 200, to: 300 });
    const cache = genCache(
      1000, 100,
      [f1, f2],
      { [f1.basePath]: [f1.path, f2.path] },
    );

    expect(cache.exists('test/path/file', { from: 50, to: 100 })).toBe(true);
    expect(cache.exists('test/path/file', { from: 200, to: 250 })).toBe(true);
    expect(cache.exists('test/path/file', { from: 150, to: 180 })).toBe(false);
  });
});
