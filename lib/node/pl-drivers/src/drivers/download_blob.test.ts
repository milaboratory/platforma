import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConsoleLoggerAdapter } from '@milaboratory/ts-helpers';
import { PlClient, PlTransaction, TestHelpers, jsonToData, FieldRef, poll, PollTxAccessor, BasicResourceData, FieldId } from '@milaboratory/pl-client-v2';
import { createDownloadDriver } from './helpers';
import { rawComputable } from '@milaboratory/computable';
import { scheduler } from 'node:timers/promises';

const fileName = "answer_to_the_ultimate_question.txt";

test('should download a blob and read its content', async () => {
  await TestHelpers.withTempRoot(async client => {
    const logger = new ConsoleLoggerAdapter();
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-download-1-'));
    const driver = createDownloadDriver(client, logger, dir, 700 * 1024);
    const downloadable = await makeDownloadableBlobFromAssets(client, fileName);

    const c = rawComputable(() => driver.getDownloadedBlob(downloadable))

    const blob = await c.getValue();
    expect(blob).toBeUndefined();

    await c.listen();

    const blob2 = await c.getValue();
    expect(blob2).not.toBeUndefined();
    expect(blob2!.success).toBeTruthy();
    if (blob2 != undefined && blob2!.success) {
      expect(blob2.path).not.toBeUndefined();
      expect(blob2.sizeBytes).toBe(3);
      expect((await driver.getContent(blob2))?.toString()).toBe("42\n");
    }
  })
})

test('should get on demand blob without downloading a blob', async () => {
  await TestHelpers.withTempRoot(async client => {
    const logger = new ConsoleLoggerAdapter();
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-download-2-'));
    const driver = createDownloadDriver(client, logger, dir, 700 * 1024);
    const downloadable = await makeDownloadableBlobFromAssets(client, fileName);

    const c = rawComputable(() => driver.getOnDemandBlob(downloadable))

    const blob = await c.getValue();
    expect(blob).not.toBeUndefined();

    const content = await driver.getContent(blob);
    expect(content).not.toBeUndefined();
    expect(content?.toString()).toStrictEqual("42\n");
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

      const c = rawComputable(() => driver.getDownloadedBlob(downloadable))

      const blob = await c.getValue();
      expect(blob).toBeUndefined();

      await c.listen();

      const blob2 = await c.getValue();
      expect(blob2).not.toBeUndefined();
      expect(blob2!.success).toBeTruthy();
      if (blob2 != undefined && blob2!.success) {
        expect(blob2.path).not.toBeUndefined();
        expect(blob2.sizeBytes).toBe(3);
        expect((await driver.getContent(blob2))?.toString()).toBe("42\n");
      }

      // The blob is removed from a cache since the size is too big.
      c.resetState();
      await scheduler.wait(100);

      const c2 = rawComputable(() => driver.getDownloadedBlob(downloadable));

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

      const c = rawComputable(() => driver.getDownloadedBlob(downloadable))

      const blob = await c.getValue();
      expect(blob).toBeUndefined();

      await c.listen();

      const blob2 = await c.getValue();
      expect(blob2).not.toBeUndefined();
      expect(blob2!.success).toBeTruthy();
      if (blob2 != undefined && blob2!.success) {
        expect(blob2.path).not.toBeUndefined();
        expect(blob2.sizeBytes).toBe(3);
        expect((await driver.getContent(blob2))?.toString()).toBe("42\n");
      }

      // The blob is removed from a cache since the size is too big.
      c.resetState();
      await scheduler.wait(100);

      const c2 = rawComputable(() => driver.getDownloadedBlob(downloadable))

      const blob3 = await c2.getValue();
      expect(blob3).not.toBeUndefined();
      expect(blob3!.success).toBeTruthy();
      if (blob3 != undefined && blob3!.success) {
        expect(blob3.path).not.toBeUndefined();
        expect(blob3.sizeBytes).toBe(3);
        expect((await driver.getContent(blob3))?.toString()).toBe("42\n");
      }
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
