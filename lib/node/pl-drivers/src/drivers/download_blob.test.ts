import { PlClient, PlTransaction, TestHelpers, jsonToData, FieldRef, poll, PollTxAccessor, BasicResourceData, FieldId } from '@milaboratory/pl-client-v2';
import * as os from 'node:os';
import * as fs from 'fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
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
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-download-1-'));
    const driver = createDownloadDriver(client, logger, dir, 700 * 1024);
    const downloadable = await makeDownloadableBlobFromAssets(client, fileName);

    const c = computable(
      driver, {}, driver => driver.getDownloadedBlob(downloadable, callerId),
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
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-download-2-'));
    const driver = createDownloadDriver(client, logger, dir, 700 * 1024);
    const downloadable = await makeDownloadableBlobFromAssets(client, fileName);

    const c = computable(
      driver, {},
      (driver, _) => driver.getUrl(downloadable, callerId),
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
      const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-download-3-'));
      const driver = createDownloadDriver(client, logger, dir, 1);
      const downloadable = await makeDownloadableBlobFromAssets(client, fileName);

      const c = computable(
        driver, {}, driver => driver.getDownloadedBlob(downloadable, callerId),
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
        driver, {}, driver => driver.getDownloadedBlob(downloadable, callerId),
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
      const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-download-4-'));
      const driver = createDownloadDriver(client, logger, dir, 700 * 1024);
      const downloadable = await makeDownloadableBlobFromAssets(client, fileName);

      const c = computable(
        driver, {},
        driver => driver.getDownloadedBlob(downloadable, callerId),
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
        driver, {}, driver => driver.getDownloadedBlob(downloadable, callerId),
      )

      const blob3 = await c2.getValue();
      expect(blob3?.path).not.toBeUndefined();
    })
  }
)

async function makeDownloadableBlobFromAssets(client: PlClient, fileName: string): Promise<BasicResourceData> {
   await client.withWriteTx(
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
    })

  return await poll(client, async (tx: PollTxAccessor) => {
    const root = await tx.get(client.clientRoot);
    const download = await root.get('result');
    return download.data;
  })
}
