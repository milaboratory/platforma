import { ResourceId } from "@milaboratory/pl-client-v2";
import { BlobResult } from "./download_and_logs_blob";
import { FilesCache } from "./files_cache";

test('should delete blob3 when add 3 blobs, exceed a soft limit and nothing holds blob3', () => {
  const cache = new FilesCache(20);
  const callerId1 = 'callerId1';
  const blob1 = new BlobResult(1n as ResourceId, 'path1', 5);
  const blob2 = new BlobResult(2n as ResourceId, 'path2', 10);
  const blob3 = new BlobResult(3n as ResourceId, 'path3', 10);

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
