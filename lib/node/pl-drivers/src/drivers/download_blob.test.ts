import { expect, test } from '@jest/globals';
import type {
  FieldId,
  FieldRef,
  PlClient,
  PlTransaction,
  PollTxAccessor } from '@milaboratories/pl-client';
import {
  jsonToData,
  poll,
  TestHelpers,
} from '@milaboratories/pl-client';
import { ConsoleLoggerAdapter, HmacSha256Signer } from '@milaboratories/ts-helpers';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { scheduler } from 'node:timers/promises';
import { createDownloadClient, createLogsClient } from '../clients/constructors';
import { DownloadDriver } from './download_blob';
import type { OnDemandBlobResourceSnapshot } from './types';

const fileName = 'answer_to_the_ultimate_question.txt';

test('should download a blob and read its content', async () => {
  await TestHelpers.withTempRoot(async (client) => {
    const logger = new ConsoleLoggerAdapter();
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-download-1-'));

    const driver = new DownloadDriver(
      logger,
      createDownloadClient(logger, client, []),
      createLogsClient(client, logger),
      dir,
      new HmacSha256Signer(HmacSha256Signer.generateSecret()),
      { cacheSoftSizeBytes: 700 * 1024, nConcurrentDownloads: 10 },
    );
    const downloadable = await makeDownloadableBlobFromAssets(client, fileName);

    const c = driver.getDownloadedBlob(downloadable);

    console.log(`should download a blob: getting computable first time`)
    const blob = await c.getValue();
    expect(blob).toBeUndefined();

    console.log(`should download a blob: awaiting change`)
    await c.awaitChange();

    console.log(`should download a blob: getting the blob second time`)
    const blob2 = await c.getValue();
    expect(blob2).toBeDefined();
    expect(blob2!.size).toBe(3);
    expect((await driver.getContent(blob2!.handle))?.toString()).toBe('42\n');

    console.log(`should download a blob: exiting`)
  });
}, 10000);

test('should not redownload a blob a file already exists', async () => {
  await TestHelpers.withTempRoot(async (client) => {
    const logger = new ConsoleLoggerAdapter();
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-download-1-'));

    const signer = new HmacSha256Signer(HmacSha256Signer.generateSecret());

    const driver = new DownloadDriver(
      logger,
      createDownloadClient(logger, client, []),
      createLogsClient(client, logger),
      dir,
      signer,
      { cacheSoftSizeBytes: 700 * 1024, nConcurrentDownloads: 10 },
    );

    console.log('Download the first time');
    const downloadable = await makeDownloadableBlobFromAssets(client, fileName);
    const c = driver.getDownloadedBlob(downloadable);
    await c.getValue();
    await c.awaitChange();
    const blob = await c.getValue();
    expect(blob).toBeDefined();
    expect(blob!.size).toBe(3);
    expect((await driver.getContent(blob!.handle))?.toString()).toBe('42\n');

    await driver.releaseAll();

    const driver2 = new DownloadDriver(
      logger,
      createDownloadClient(logger, client, []),
      createLogsClient(client, logger),
      dir,
      signer,
      { cacheSoftSizeBytes: 700 * 1024, nConcurrentDownloads: 10 },
    );

    console.log('Download the second time');
    const c2 = driver2.getDownloadedBlob(downloadable);
    await c2.getValue();
    await c2.awaitChange();
    const blob2 = await c2.getValue();
    expect(blob2).toBeDefined();
    expect(blob2!.size).toBe(3);
    expect((await driver.getContent(blob2!.handle))?.toString()).toBe('42\n');
  });
});

test('should get on demand blob without downloading a blob', async () => {
  await TestHelpers.withTempRoot(async (client) => {
    const logger = new ConsoleLoggerAdapter();
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-download-2-'));
    const driver = new DownloadDriver(
      logger,
      createDownloadClient(logger, client, []),
      createLogsClient(client, logger),
      dir,
      new HmacSha256Signer(HmacSha256Signer.generateSecret()),
      { cacheSoftSizeBytes: 700 * 1024, nConcurrentDownloads: 10 },
    );

    const downloadable = await makeDownloadableBlobFromAssets(client, fileName);
    const c = driver.getOnDemandBlob(downloadable);

    const blob = await c.getValue();
    expect(blob).toBeDefined();
    expect(blob.size).toEqual(3);

    const content = await driver.getContent(blob!.handle);
    expect(content?.toString()).toStrictEqual('42\n');
  });
});

test('should get undefined when releasing a blob from a small cache and the blob was deleted.', async () => {
  await TestHelpers.withTempRoot(async (client) => {
    const logger = new ConsoleLoggerAdapter();
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-download-3-'));
    const driver = new DownloadDriver(
      logger,
      createDownloadClient(logger, client, []),
      createLogsClient(client, logger),
      dir,
      new HmacSha256Signer(HmacSha256Signer.generateSecret()),
      { cacheSoftSizeBytes: 1, nConcurrentDownloads: 10 },
    );
    const downloadable = await makeDownloadableBlobFromAssets(client, fileName);

    const c = driver.getDownloadedBlob(downloadable);

    const blob = await c.getValue();
    expect(blob).toBeUndefined();

    await c.awaitChange();

    const blob2 = await c.getValue();
    expect(blob2).toBeDefined();
    expect(blob2!.size).toBe(3);
    expect((await driver.getContent(blob2!.handle))?.toString()).toBe('42\n');

    // The blob is removed from a cache since the size is too big.
    c.resetState();
    await scheduler.wait(100);

    const c2 = driver.getDownloadedBlob(downloadable);

    const noBlob = await c2.getValue();
    expect(noBlob).toBeUndefined();
  });
});

test('should get the blob when releasing a blob, but a cache is big enough and it keeps a file on the local drive.', async () => {
  await TestHelpers.withTempRoot(async (client) => {
    const logger = new ConsoleLoggerAdapter();
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-download-4-'));
    const driver = new DownloadDriver(
      logger,
      createDownloadClient(logger, client, []),
      createLogsClient(client, logger),
      dir,
      new HmacSha256Signer(HmacSha256Signer.generateSecret()),
      { cacheSoftSizeBytes: 700 * 1024, nConcurrentDownloads: 10 },
    );
    const downloadable = await makeDownloadableBlobFromAssets(client, fileName);

    const c = driver.getDownloadedBlob(downloadable);

    const blob = await c.getValue();
    expect(blob).toBeUndefined();

    await c.awaitChange();

    const blob2 = await c.getValue();
    expect(blob2).toBeDefined();
    expect(blob2!.size).toBe(3);
    expect((await driver.getContent(blob2!.handle))?.toString()).toBe('42\n');

    // The blob is removed from a cache since the size is too big.
    c.resetState();
    await scheduler.wait(100);

    const c2 = driver.getDownloadedBlob(downloadable);

    const blob3 = await c2.getValue();
    expect(blob3).toBeDefined();
    expect(blob3!.size).toBe(3);
    expect((await driver.getContent(blob3!.handle))?.toString()).toBe('42\n');
  });
});

async function makeDownloadableBlobFromAssets(client: PlClient, fileName: string) {
  await client.withWriteTx('MakeAssetDownloadable', async (tx: PlTransaction) => {
    const importSettings = jsonToData({
      path: fileName,
      storageId: 'library',
    });
    const importer = tx.createStruct({ name: 'BlobImportInternal', version: '1' }, importSettings);
    const importerBlob: FieldRef = {
      resourceId: importer,
      fieldName: 'blob',
    };

    const download = tx.createStruct({
      name: 'BlobDownload',
      version: '2',
    });
    const downloadBlob: FieldRef = {
      resourceId: download,
      fieldName: 'blob',
    };
    const downloadDownloadable: FieldRef = {
      resourceId: download,
      fieldName: 'downloadable',
    };

    const dynamicId: FieldId = {
      resourceId: client.clientRoot,
      fieldName: 'result',
    };

    tx.setField(downloadBlob, importerBlob);
    tx.createField(dynamicId, 'Dynamic', downloadDownloadable);
    await tx.commit();
  });

  const [download, kv] = await poll(client, async (tx: PollTxAccessor) => {
    const root = await tx.get(client.clientRoot);
    const download = await root.get('result');

    return [download.data, await download.getKValueObj<{ sizeBytes: string }>('ctl/file/blobInfo')];
  });

  return {
    id: download.id,
    type: download.type,
    data: undefined,
    fields: undefined,
    kv: {
      'ctl/file/blobInfo': {
        sizeBytes: Number(kv.sizeBytes),
      },
    },
  } as OnDemandBlobResourceSnapshot;
}
