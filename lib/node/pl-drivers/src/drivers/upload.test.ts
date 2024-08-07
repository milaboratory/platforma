import {
  FieldId,
  isNotNullResourceId,
  PlTransaction,
  PollTxAccessor,
  ResourceId,
  TestHelpers
} from '@milaboratory/pl-client-v2';
import {
  ConsoleLoggerAdapter,
  HmacSha256Signer
} from '@milaboratory/ts-helpers';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { PlClient } from '@milaboratory/pl-client-v2';
import { poll } from '@milaboratory/pl-client-v2';
import { UploadOpts, UploadDriver, UploadResourceSnapshot } from './upload';
import {
  createUploadBlobClient,
  createUploadProgressClient
} from '../clients/helpers';

test('upload a blob', async () => {
  await withTest(
    '42',
    async ({ client, uploader, mtime, fPath, fileSignature }: TestArg) => {
      const uploadId = await createBlobUpload(
        client,
        fPath,
        2n,
        fileSignature,
        mtime
      );
      const handleRes = await getHandleField(client, uploadId);

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
    }
  );
});

test('upload a big blob', async () => {
  const lotsOfNumbers: number[] = [];
  for (let i = 0; i < 5000000; i++) {
    lotsOfNumbers.push(i);
  }
  const hugeString = lotsOfNumbers.join(' ');

  await withTest(
    hugeString,
    async ({ client, uploader, mtime, fPath, fileSignature }: TestArg) => {
      const uploadId = await createBlobUpload(
        client,
        fPath,
        BigInt(hugeString.length),
        fileSignature,
        mtime
      );
      const handleRes = await getHandleField(client, uploadId);

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
    }
  );
});

test('upload a blob with wrong modification time', async () => {
  await withTest(
    '42',
    async ({ client, uploader, mtime, fPath, fileSignature }: TestArg) => {
      const uploadId = await createBlobUpload(
        client,
        fPath,
        2n,
        fileSignature,
        mtime - 1000n
      );
      const handleRes = await getHandleField(client, uploadId);

      const c = uploader.getProgressId(handleRes);

      while (true) {
        try {
          await c.getValue();
        } catch (e: any) {
          if (String(e).includes('file was modified')) return;
          throw e;
        }

        await c.awaitChange();
      }
    }
  );
});

test('upload a duplicate blob', async () => {
  await withTest(
    '42',
    async ({ client, uploader, mtime, fPath, fileSignature }: TestArg) => {
      const uploadId = await createBlobUpload(
        client,
        fPath,
        2n,
        fileSignature,
        mtime
      );
      const handleRes = await getHandleField(client, uploadId);

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
    }
  );
});

test('upload lots of duplicate blobs concurrently', async () => {
  await TestHelpers.withTempRoot(async (client) => {
    const signer = new HmacSha256Signer(HmacSha256Signer.generateSecret());
    const logger = new ConsoleLoggerAdapter();
    const uploader = new UploadDriver(
      logger,
      signer,
      createUploadBlobClient(client, logger),
      createUploadProgressClient(client, logger)
    );

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test'));
    const n = 100;

    const settings: any[] = [];
    for (let i = 0; i < n; i++) {
      const fPath = path.join(tmpDir, `testUploadABlob_${i}.txt`);
      const data = Buffer.from(
        new TextEncoder().encode('DuplicateBlobsFileContent')
      );
      await fs.writeFile(fPath, data);
      const f = await fs.open(fPath);
      const stats = await fs.stat(fPath);
      const mtime = BigInt(Math.floor(stats.mtime.getTime() / 1000));
      const sign = signer.sign(fPath);
      await f.close();

      settings.push({
        path: fPath,
        sizeBytes: 25n,
        signature: signer.sign(fPath),
        mTime: mtime
      });
    }

    const { mapId, uploadIds } = await createMapOfUploads(client, n, settings);

    const handles = await Promise.all(
      uploadIds.map((id) => getHandleField(client, id))
    );
    const computables = handles.map((handle) => uploader.getProgressId(handle));

    console.log('HERE: ', handles);
    console.log('HERE2: ', computables);
    console.log('HERE: ', uploader);
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
  await withTest('', async ({ client, uploader }: TestArg) => {
    const uploadId = await createBlobIndex(
      client,
      'another_answer_to_the_ultimate_question.txt',
      'library'
    );
    const handleRes = await getHandleField(client, uploadId);

    const c = uploader.getProgressId(handleRes);

    while (true) {
      const p = await c.getValue();
      console.log('got index progress: ', p);

      expect(p.isUpload).toBeFalsy();
      expect(p.isUploadSignMatch).toBeUndefined();
      if (p.done) {
        expect(p.lastError).toBeUndefined();
        return;
      }

      await c.awaitChange();
    }
  });
});

interface TestArg {
  client: PlClient;
  uploader: UploadDriver;
  f: fs.FileHandle;
  fPath: string;
  mtime: bigint;
  fileSignature: string;
}

async function withTest(
  fileContent: string,
  cb: (arg: TestArg) => Promise<void>
) {
  await TestHelpers.withTempRoot(async (client) => {
    const signer = new HmacSha256Signer(HmacSha256Signer.generateSecret());
    const logger = new ConsoleLoggerAdapter();
    const uploader = new UploadDriver(
      logger,
      signer,
      createUploadBlobClient(client, logger),
      createUploadProgressClient(client, logger)
    );

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test'));
    const fPath = path.join(tmpDir, 'testUploadABlob.txt');
    const data = Buffer.from(new TextEncoder().encode(fileContent));
    await fs.writeFile(fPath, data);
    const f = await fs.open(fPath);
    const stats = await fs.stat(fPath);
    const mtime = BigInt(Math.floor(stats.mtime.getTime() / 1000));
    const sign = signer.sign(fPath);

    await cb({ client, uploader, f, fPath, mtime, fileSignature: sign });

    await f.close();
    await uploader.releaseAll();
  });
}

async function createMapOfUploads(
  c: PlClient,
  n: number,
  settings: {
    path: string;
    sizeBytes: bigint;
    signature: string;
    mTime: bigint;
  }[]
) {
  return await c.withWriteTx(
    'UploaderCreateMapOfUploads',
    async (tx: PlTransaction) => {
      const uploads: ResourceId[] = [];

      const mapId = tx.createStruct({ name: 'StdMap', version: '1' });
      for (let i = 0; i < n; i++) {
        const uploadId = await createBlobUploadTx(
          tx,
          settings[i].path,
          settings[i].sizeBytes,
          settings[i].signature,
          settings[i].mTime
        );
        uploads.push(uploadId);
        const fId = { resourceId: mapId, fieldName: String(i) };
        tx.createField(fId, 'Input');
        tx.setField(fId, uploadId);
      }

      tx.createField(
        { resourceId: c.clientRoot, fieldName: 'project1' },
        'Dynamic',
        mapId
      );
      await tx.commit();

      return {
        mapId: await mapId.globalId,
        uploadIds: uploads
      };
    },
    {}
  );
}

async function createBlobUpload(
  c: PlClient,
  path: string,
  sizeBytes: bigint,
  signature: string,
  mTime: bigint
): Promise<ResourceId> {
  return await c.withWriteTx(
    'UploadDriverCreateTest',
    async (tx: PlTransaction) => {
      const uploadId = await createBlobUploadTx(
        tx,
        path,
        sizeBytes,
        signature,
        mTime
      );

      tx.createField(
        { resourceId: c.clientRoot, fieldName: 'project1' },
        'Dynamic',
        uploadId
      );
      await tx.commit();

      return uploadId;
    },
    {}
  );
}

async function createBlobUploadTx(
  tx: PlTransaction,
  path: string,
  sizeBytes: bigint,
  signature: string,
  mTime: bigint
): Promise<ResourceId> {
  const settings = {
    modificationTime: mTime.toString(),
    localPath: path,
    pathSignature: signature,
    sizeBytes: sizeBytes.toString()
  };
  const data = new TextEncoder().encode(JSON.stringify(settings));
  const upload = tx.createStruct({ name: 'BlobUpload', version: '1' }, data);

  return await upload.globalId;
}

async function createBlobIndex(
  c: PlClient,
  path: string,
  storageId: string
): Promise<ResourceId> {
  return await c.withWriteTx(
    'UploadDriverCreateTest',
    async (tx: PlTransaction) => {
      const settings = {
        storageId: storageId,
        path: path
      };
      const data = new TextEncoder().encode(JSON.stringify(settings));
      const importInternal = tx.createStruct(
        { name: 'BlobImportInternal', version: '1' },
        data
      );
      tx.createField(
        { resourceId: c.clientRoot, fieldName: 'project1' },
        'Dynamic',
        importInternal
      );
      await tx.commit();

      return await importInternal.globalId;
    },
    {}
  );
}

async function getHandleField(
  client: PlClient,
  uploadId: ResourceId
): Promise<UploadResourceSnapshot> {
  return await poll(client, async (tx: PollTxAccessor) => {
    const upload = await tx.get(uploadId);
    const handle = await upload.get('handle');

    const blob = handle.data.fields.find((f) => f.name == 'blob')?.value;
    const incarnation = handle.data.fields.find(
      (f) => f.name == 'incarnation'
    )?.value;

    const fields = {
      blob: undefined as ResourceId | undefined,
      incarnation: undefined as ResourceId | undefined
    };
    if (blob != undefined && isNotNullResourceId(blob)) fields.blob = blob;
    if (incarnation != undefined && isNotNullResourceId(incarnation))
      fields.incarnation = incarnation;

    return {
      ...handle.data,
      data: JSON.parse(handle.data.data!.toString()) as UploadOpts,
      fields,
      kv: undefined
    };
  });
}
