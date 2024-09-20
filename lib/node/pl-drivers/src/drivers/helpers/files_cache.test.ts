import { CachedFile, FilesCache } from './files_cache';
import { CallersCounter } from '@milaboratories/ts-helpers';

test('should delete blob3 when add 3 blobs, exceed a soft limit and nothing holds blob3', () => {
  const cache = new FilesCache(20);
  const callerId1 = 'callerId1';
  const blob1: CachedFile = {
    path: 'path1',
    sizeBytes: 5,
    counter: new CallersCounter()
  };
  const blob2: CachedFile = {
    path: 'path2',
    sizeBytes: 10,
    counter: new CallersCounter()
  };
  const blob3: CachedFile = {
    path: 'path3',
    sizeBytes: 10,
    counter: new CallersCounter()
  };

  // add blobs and check that we don't exceed the soft limit.
  cache.addCache(blob1, callerId1);
  cache.addCache(blob2, callerId1);
  expect(cache.toDelete()).toHaveLength(0);

  // add already existing blob and, again, check that we don't exceed the limit.
  cache.addCache(blob2, callerId1);
  expect(cache.toDelete()).toHaveLength(0);

  // add the third blob. We exceeds a soft limit,
  // but every blob has a positive counter,
  // so we can't delete anything.
  cache.addCache(blob3, callerId1);
  expect(cache.toDelete()).toHaveLength(0);

  // blob3 have a zero counter, we can delete it.
  const toDelete = cache.removeFile(blob3.path, callerId1);
  expect(toDelete).toStrictEqual([blob3]);

  // removes blob3 from a cache, checks that others are still there.
  cache.removeCache(blob3);
  expect(cache.getFile(blob1.path, callerId1)).toBe(blob1);
  expect(cache.getFile(blob2.path, callerId1)).toBe(blob2);
  expect(cache.getFile(blob3.path, callerId1)).toBeUndefined();
});

test('regression should allow to add empty files', () => {
  const cache = new FilesCache(1);
  const callerId1 = 'callerId1';
  const blob1: CachedFile = {
    path: 'path1',
    sizeBytes: 0,
    counter: new CallersCounter()
  };
  const blob2: CachedFile = {
    path: 'path2',
    sizeBytes: 2,
    counter: new CallersCounter()
  };

  // add a blob with 0 size.
  cache.addCache(blob1, callerId1);
  expect(cache.toDelete()).toHaveLength(0);

  // add a blob that exceed a soft limit
  cache.addCache(blob2, callerId1);
  expect(cache.toDelete()).toHaveLength(0);

  // this blob should be deleted
  const toDelete = cache.removeFile(blob2.path, callerId1);
  expect(toDelete).toStrictEqual([blob2]);

  cache.removeCache(blob2);

  // and the the blob with zero size remained
  expect(cache.getFile(blob1.path, callerId1)).toBe(blob1);
});
