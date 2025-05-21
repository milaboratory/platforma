import type { PlClient, PlTransaction, ResourceId } from '@milaboratories/pl-client';
import { TestHelpers } from '@milaboratories/pl-client';
import type { Signer } from '@milaboratories/ts-helpers';
import { ConsoleLoggerAdapter, HmacSha256Signer } from '@milaboratories/ts-helpers';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { makeBlobImportSnapshot, UploadDriver } from './upload';
import { createUploadBlobClient, createUploadProgressClient } from '../clients/constructors';
import { expect, test } from 'vitest';
import { Computable } from '@milaboratories/computable';
import { SynchronizedTreeState } from '@milaboratories/pl-tree';
import type { ImportResourceSnapshot } from './types';
import * as env from '../test_env';

test('upload a blob', async () => {
  await withTest(async ({ client, uploader, signer }: TestArg) => {
    const stats = await writeFile('42', signer);
    const uploadId = await createBlobUpload(client, stats);
    const handleRes = await getSnapshot(client, uploadId);

    const c = uploader.getProgressId(handleRes);

    while (true) {
      const p = await c.getValue();

      expect(p.isUpload).toBeTruthy();
      expect(p.isUploadSignMatch).toBeTruthy();
      if (p.done) {
        expect(p.lastError).toBeUndefined();
        expect(p.status?.bytesProcessed).toBe(2);
        expect(p.status?.bytesTotal).toBe(2);

        return;
      }

      await c.awaitChange();
    }
  });
});

test('upload a big blob', async () => {
  const lotsOfNumbers: number[] = [];
  for (let i = 0; i < 5000000; i++) {
    lotsOfNumbers.push(i);
  }
  const hugeString = lotsOfNumbers.join(' ');

  await withTest(async ({ client, uploader, signer }: TestArg) => {
    const stats = await writeFile(hugeString, signer);
    const uploadId = await createBlobUpload(client, stats);
    const handleRes = await getSnapshot(client, uploadId);

    const c = uploader.getProgressId(handleRes);

    while (true) {
      const p = await c.getValue();
      console.log('got progress of big blob: ', p);

      expect(p.isUpload).toBeTruthy();
      if (p.done) {
        expect(p.isUploadSignMatch).toBeTruthy();
        expect(p.lastError).toBeUndefined();
        expect(p.status?.bytesProcessed).toStrictEqual(p.status?.bytesTotal);

        return;
      }

      await c.awaitChange();
    }
  });
});

// unskip if you need to test uploads of big files
test.skip('upload a very big blob', async () => {
  await withTest(async ({ client, uploader, signer }: TestArg) => {
    //       const size = 4 * (1 << 30); // 4 GB
    //       const anAnswer = Buffer.from(new TextEncoder().encode(`
    // "Good morning," said Deep Thought at last.
    // "do you have... er, that is..."
    // "An answer for you?" interrupted Deep Thought majestically. "Yes. I have."
    // ...
    // "Forty-two," said Deep Thought, with infinite majesty and calm.
    // ...
    // "We're going to get lynched aren't we?" he whispered.
    // `));
    //       const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test'));
    //       const fPath = path.join(tmpDir, 'verybig.txt');
    //       const fileToWrite = await fsp.open(fPath, 'w')

    //       for (let i = 0; i <= (size / anAnswer.length); i++) {
    //         await fileToWrite.write(anAnswer)
    //         if (i % 100 == 0)
    //           console.log(`wrote ${i/(size / anAnswer.length)}`);
    //       }
    //       await fileToWrite.close();

    // const stats = await getFileStats(signer, fPath)
    const stats = await getFileStats(signer, '/home/snyssfx/Downloads/a_very_big_file.txt');
    const uploadId = await createBlobUpload(client, stats);
    const handleRes = await getSnapshot(client, uploadId);

    const c = uploader.getProgressId(handleRes);

    while (true) {
      const p = await c.getValue();
      console.log('got progress of a very big blob: ', p);

      expect(p.isUpload).toBeTruthy();
      if (p.done) {
        expect(p.isUploadSignMatch).toBeTruthy();
        expect(p.status?.bytesProcessed).toStrictEqual(p.status?.bytesTotal);

        return;
      }

      await c.awaitChange();
    }
  });
}, 1000000000);

test('upload a blob with wrong modification time', async () => {
  await withTest(async ({ client, uploader, signer }: TestArg) => {
    const stats = await writeFile('42', signer);
    stats.mtime -= 1000n;
    const uploadId = await createBlobUpload(client, stats);
    const handleRes = await getSnapshot(client, uploadId);

    const c = uploader.getProgressId(handleRes);

    while (true) {
      try {
        await c.getValue();
      } catch (e: any) {
        if (String(e).includes('file was modified')) {
          return;
        }
        throw e;
      }

      await c.awaitChange();
    }
  });
});

test('upload a duplicate blob', async () => {
  await withTest(async ({ client, uploader, signer }: TestArg) => {
    const stats = await writeFile('42', signer);
    const uploadId = await createBlobUpload(client, stats);
    const handleRes = await getSnapshot(client, uploadId);

    const cOrig = uploader.getProgressId(handleRes);
    const cDupl = uploader.getProgressId(handleRes);

    while (true) {
      const pOrig = await cOrig.getValue();
      const pDupl = await cDupl.getValue();

      expect(pDupl).toStrictEqual(pOrig);
      expect(pDupl.isUpload).toBeTruthy();
      if (pDupl.done) {
        expect(pDupl.isUploadSignMatch).toBeTruthy();
        expect(pDupl.lastError).toBeUndefined();
        expect(pDupl.status?.bytesProcessed).toBe(2);
        expect(pDupl.status?.bytesTotal).toBe(2);

        return;
      }

      await cDupl.awaitChange();
    }
  });
});

test('upload lots of duplicate blobs concurrently', async () => {
  await TestHelpers.withTempRoot(async (client) => {
    const signer = new HmacSha256Signer(HmacSha256Signer.generateSecret());
    const logger = new ConsoleLoggerAdapter();
    const uploader = new UploadDriver(
      logger,
      signer,
      createUploadBlobClient(client, logger),
      createUploadProgressClient(client, logger),
    );

    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test'));
    const n = 100;

    const settings: FileStat[] = [];
    for (let i = 0; i < n; i++) {
      const stat = await writeFile(
        'DuplicateBlobsFileContent',
        signer,
        tmpDir,
        `testUploadABlob_${i}.txt`,
      );

      settings.push(stat);
    }

    const { uploadIds } = await createMapOfUploads(client, n, settings);

    const handles = await Promise.all(uploadIds.map((id) => getSnapshot(client, id)));
    const computables = handles.map((handle) => uploader.getProgressId(handle));

    for (const c of computables) {
      while (true) {
        const p = await c.getValue();

        if (p.done) {
          expect(p.isUploadSignMatch).toBeTruthy();
          expect(p.lastError).toBeUndefined();
          expect(p.status?.bytesProcessed).toBe(25);
          expect(p.status?.bytesTotal).toBe(25);
          return;
        }

        await c.awaitChange();
      }
    }

    await uploader.releaseAll();
  });
});

test('index a blob', async () => {
  await withTest(async ({ client, uploader }: TestArg) => {
    const uploadId = await createBlobIndex(
      client,
      './another_answer_to_the_ultimate_question.txt',
      env.libraryStorage,
    );
    const handleRes = await getSnapshot(client, uploadId);

    const c = uploader.getProgressId(handleRes);

    while (true) {
      const p = await c.getValue();
      console.log('got index progress: ', p);

      expect(p.isUpload).toBeFalsy();
      expect(p.isUploadSignMatch).toBeUndefined();
      if (p.done) {
        return;
      }

      await c.awaitChange();
    }
  });
});

interface TestArg {
  client: PlClient;
  uploader: UploadDriver;
  signer: Signer;
}

async function withTest(cb: (arg: TestArg) => Promise<void>) {
  await TestHelpers.withTempRoot(async (client) => {
    const signer = new HmacSha256Signer(HmacSha256Signer.generateSecret());
    const logger = new ConsoleLoggerAdapter();
    const uploader = new UploadDriver(
      logger,
      signer,
      createUploadBlobClient(client, logger),
      createUploadProgressClient(client, logger),
    );

    await cb({ client, uploader, signer });

    await uploader.releaseAll();
  });
}

interface FileStat {
  fPath: string;
  mtime: bigint;
  fileSignature: string;
  size: number;
}

async function writeFile(
  fileContent: string,
  signer: Signer,
  tmpDir?: string,
  fileName: string = 'testUploadABlob.txt',
): Promise<FileStat> {
  if (tmpDir == undefined) tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test'));

  const fPath = path.join(tmpDir, fileName);

  const data = Buffer.from(new TextEncoder().encode(fileContent));
  await fsp.writeFile(fPath, data);

  return await getFileStats(signer, fPath);
}

async function getFileStats(signer: Signer, fPath: string): Promise<FileStat> {
  const fileSignature = signer.sign(fPath);
  const stats = await fsp.stat(fPath);
  const mtime = BigInt(Math.floor(stats.mtime.getTime() / 1000));

  return { fPath, mtime, fileSignature, size: stats.size };
}

async function createMapOfUploads(c: PlClient, n: number, settings: FileStat[]) {
  return await c.withWriteTx(
    'UploaderCreateMapOfUploads',
    async (tx: PlTransaction) => {
      const uploads: ResourceId[] = [];

      const mapId = tx.createStruct({ name: 'StdMap', version: '1' });
      for (let i = 0; i < n; i++) {
        const uploadId = await createBlobUploadTx(tx, settings[i]);
        uploads.push(uploadId);
        const fId = { resourceId: mapId, fieldName: String(i) };
        tx.createField(fId, 'Input');
        tx.setField(fId, uploadId);
      }

      tx.createField({ resourceId: c.clientRoot, fieldName: 'project1' }, 'Dynamic', mapId);
      await tx.commit();

      return {
        mapId: await mapId.globalId,
        uploadIds: uploads,
      };
    },
    {},
  );
}

async function createBlobUpload(c: PlClient, stat: FileStat): Promise<ResourceId> {
  return await c.withWriteTx(
    'UploadDriverCreateTest',
    async (tx: PlTransaction) => {
      const uploadId = await createBlobUploadTx(tx, stat);

      tx.createField({ resourceId: c.clientRoot, fieldName: 'project1' }, 'Dynamic', uploadId);
      await tx.commit();

      return uploadId;
    },
    {},
  );
}

async function createBlobUploadTx(tx: PlTransaction, stat: FileStat): Promise<ResourceId> {
  const settings = {
    modificationTime: stat.mtime.toString(),
    localPath: stat.fPath,
    pathSignature: stat.fileSignature,
    sizeBytes: stat.size.toString(),
  };
  const data = new TextEncoder().encode(JSON.stringify(settings));
  const upload = tx.createStruct({ name: 'BlobUpload', version: '1' }, data);

  return await upload.globalId;
}

async function createBlobIndex(c: PlClient, path: string, storageId: string): Promise<ResourceId> {
  return await c.withWriteTx(
    'UploadDriverCreateTest',
    async (tx: PlTransaction) => {
      const settings = {
        storageId: storageId,
        path: path,
      };
      const data = new TextEncoder().encode(JSON.stringify(settings));
      const importInternal = tx.createStruct({ name: 'BlobImportInternal', version: '1' }, data);
      tx.createField(
        { resourceId: c.clientRoot, fieldName: 'project1' },
        'Dynamic',
        importInternal,
      );
      await tx.commit();

      return await importInternal.globalId;
    },
    {},
  );
}

async function getSnapshot(
  client: PlClient,
  uploadId: ResourceId,
): Promise<ImportResourceSnapshot> {
  const tree = await SynchronizedTreeState.init(client, uploadId, {
    stopPollingDelay: 600,
    pollingInterval: 300,
  });
  try {
    const computable = Computable.make((ctx) => {
      const handle = ctx
        .accessor(tree.entry())
        .node()
        .traverse({ field: 'handle', assertFieldType: 'Output' });
      if (!handle) return undefined;
      else return makeBlobImportSnapshot(handle, ctx);
    }).withStableType();
    while (true) {
      const value = await computable.getValue();
      if (value !== undefined) return value as ImportResourceSnapshot;
      await computable.awaitChange();
    }
  } finally {
    await tree.terminate();
  }
}
