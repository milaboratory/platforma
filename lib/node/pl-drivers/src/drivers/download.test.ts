import { PlClient, PlTransaction, ResourceId, TestHelpers, jsonToData, FieldRef, poll, PollTxAccessor, BasicResourceData, FieldId } from '@milaboratory/pl-client-v2';
import { BlobResult, FilesCache } from './download';
import * as os from 'node:os';
import * as fs from 'fs';
import { Readable } from 'node:stream';
import { ConsoleLoggerAdapter } from '@milaboratory/ts-helpers';
import { createDownloadDriver } from './helpers';
import { computable } from '@milaboratory/computable';
import { text } from "node:stream/consumers";

const callerId = 'callerId';
const fileName = "answer_to_the_ultimate_question.txt";

test('should download a blob and read its content', async () => {
  await TestHelpers.withTempRoot(async client => {
    const logger = new ConsoleLoggerAdapter();
    const driver = await createDownloadDriver(client, logger, {}, os.tmpdir(), 700 * 1024);
    const downloadable = await makeDownloadableBlobFromAssets(client, fileName);

    const c = computable(
      driver, {},
      (driver, ctx) => driver.getPathToDownloadedBlob(downloadable.id, downloadable.type, callerId),
    )

    const blob = await c.getValue();
    expect(blob).toBeUndefined();

    await c.listen();

    const blob2 = await c.getValue();
    expect(blob2?.path).not.toBeUndefined();
    expect(blob2?.sizeBytes).toBe(3);
    expect(await text(Readable.toWeb(fs.createReadStream(blob2!.path)))).toBe("42\n");
  })
})

test('should get a download url without downloading a blob', async () => {
  await TestHelpers.withTempRoot(async client => {
    const logger = new ConsoleLoggerAdapter();
    const driver = await createDownloadDriver(client, logger, {}, os.tmpdir(), 700 * 1024);
    const downloadable = await makeDownloadableBlobFromAssets(client, fileName);

    const c = computable(
      driver, {},
      (driver, _) => driver.getUrl(downloadable.id, downloadable.type, callerId),
    )

    const url1 = await c.getValue();
    expect(url1).toBeUndefined();

    await c.listen();

    const url2 = await c.getValue();
    expect(url2).not.toBeUndefined();
  })
})

test(
  'should get undefined when releasing a blob from a small cache and the blob was deleted.',
  async () => {
    await TestHelpers.withTempRoot(async client => {
      const logger = new ConsoleLoggerAdapter();
      const driver = await createDownloadDriver(client, logger, {}, os.tmpdir(), 1);
      const downloadable = await makeDownloadableBlobFromAssets(client, fileName);

      const c = computable(
        driver, {},
        (driver, ctx) => driver.getPathToDownloadedBlob(downloadable.id, downloadable.type, callerId),
      )

      const blob = await c.getValue();
      expect(blob).toBeUndefined();

      await c.listen();

      const blob2 = await c.getValue();
      expect(blob2?.path).not.toBeUndefined();
      expect(blob2?.sizeBytes).toBe(3);
      expect(await text(Readable.toWeb(fs.createReadStream(blob2!.path)))).toBe("42\n");
      
      // The blob is removed from a cache since the size is too big.
      await driver.releaseBlob(downloadable.id, callerId);

      const c2 = computable(
        driver, {},
        (driver, ctx) => driver.getPathToDownloadedBlob(downloadable.id, downloadable.type, callerId),
      )

      const noBlob = await c2.getValue();
      expect(noBlob).toBeUndefined();
    })
})

test(
  'should get the blob when releasing a blob, but a cache is big enough and it keeps a file on the local drive.',
  async () => {
    await TestHelpers.withTempRoot(async client => {
      const logger = new ConsoleLoggerAdapter();
      const driver = await createDownloadDriver(client, logger, {}, os.tmpdir(), 700 * 1024);
      const downloadable = await makeDownloadableBlobFromAssets(client, fileName);

      const c = computable(
        driver, {},
        (driver, ctx) => driver.getPathToDownloadedBlob(downloadable.id, downloadable.type, callerId),
      )

      const blob = await c.getValue();
      expect(blob).toBeUndefined();

      await c.listen();

      const blob2 = await c.getValue();
      expect(blob2?.path).not.toBeUndefined();
      expect(blob2?.sizeBytes).toBe(3);
      expect(await text(Readable.toWeb(fs.createReadStream(blob2!.path)))).toBe("42\n");
      
      // The blob isn't removed since the cache is big
      await driver.releaseBlob(downloadable.id, callerId);

      const c2 = computable(
        driver, {},
        (driver, ctx) => driver.getPathToDownloadedBlob(downloadable.id, downloadable.type, callerId),
      )

      const blob3 = await c2.getValue();
      expect(blob3?.path).not.toBeUndefined();
    })
  })

async function makeDownloadableBlobFromAssets(client: PlClient, fileName: string): Promise<BasicResourceData> {
  const dynamicId = await client.withWriteTx(
    'MakeAssetDownloadable',
    async (tx: PlTransaction) => {
      const importSettings = jsonToData({
        path: fileName,
        storageId: "library"
      });
      const importer = tx.createStruct({ name: "BlobImportInternal", version: "1" }, importSettings);
      const importerBlob: FieldRef = { resourceId: importer, fieldName: 'blob' };

      const download = tx.createStruct({ name: "BlobDownload", version: "2" });
      const downloadBlob: FieldRef = { resourceId: download, fieldName: 'blob' };
      const downloadDownloadable: FieldRef = { resourceId: download, fieldName: 'downloadable' };

      const dynamicId: FieldId = { resourceId: client.clientRoot, fieldName: 'result' };

      tx.setField(downloadBlob, importerBlob)
      tx.createField(dynamicId, 'Dynamic', downloadDownloadable);
      await tx.commit();

      return dynamicId;
    })

  return await poll(client, async (tx: PollTxAccessor) => {
    const root = await tx.get(client.clientRoot);
    const download = await root.get('result');
    return download.data;
  })
}

test('should delete blob3 when add 3 blobs, exceed a soft limit and nothing holds blob3', () => {
  const cache = new FilesCache(20);
  const callerId1 = 'callerId1';
  const blob1: BlobResult = {rId: 1n as ResourceId, path: 'path1', sizeBytes: 5};
  const blob2: BlobResult = {rId: 2n as ResourceId, path: 'path2', sizeBytes: 10};
  const blob3: BlobResult = {rId: 3n as ResourceId, path: 'path3', sizeBytes: 10};

  // add blobs and check that we don't exceed the soft limit.
  cache.addCache(blob1, callerId1);
  cache.addCache(blob2, callerId1);
  expect(cache.needDelete()).toHaveLength(0);

  // add already existing blob and, again, check that we don't exceed the limit.
  cache.addCache(blob2, callerId1);
  expect(cache.needDelete()).toHaveLength(0);

  // add the third blob. We exceeds a soft limit,
  // but every blob has a positive counter,
  // so we can't delete anything.
  cache.addCache(blob3, callerId1);
  expect(cache.needDelete()).toHaveLength(0);

  // blob3 have a zero counter, we can delete it.
  cache.decCounter(blob3.path, callerId1);
  expect(cache.needDelete()).toStrictEqual([blob3]);

  // removes blob3 from a cache, checks that others are still there.
  cache.removeCache(blob3);
  expect(cache.getBlob(blob1.path)).toBe(blob1);
  expect(cache.getBlob(blob2.path)).toBe(blob2);
  expect(cache.getBlob(blob3.path)).toBeUndefined();
});
