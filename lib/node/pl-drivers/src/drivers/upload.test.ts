import { BasicResourceData, PlTransaction, PollTxAccessor, ResourceId, TestHelpers } from '@milaboratory/pl-client-v2';
import { ConsoleLoggerAdapter } from '@milaboratory/ts-helpers';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { PlClient } from '@milaboratory/pl-client-v2';
import { computable } from '@milaboratory/computable';
import { UploadDriver } from './upload';
import { makeGetSignatureFn } from '../signature';
import { poll } from '@milaboratory/pl-client-v2';
import { createUploadDriver } from './helpers';

const callerId = 'callerId';

test('upload a blob', async () => {
  withTest(
    '42',
    async ({ client, uploader, mtime, fPath, fileSignature }: TestArg) => {
      const uploadId = await createBlobUpload(client, fPath, 2n, fileSignature, mtime);
      const handleRes = await getHandleField(client, uploadId);

      const c = computable(
        uploader, {},
        (uploader, ctx) => uploader.getProgressId(handleRes.id, handleRes.type, callerId),
        (val, stable) => uploader.getProgress(val),
      )

      while (true) {
        const p = await c.getValue();

        expect(p.isUpload).toBeTruthy();
        if (p.done) {
          expect(p.isUploadSignMatch).toBeTruthy();
          expect(p.lastError).toBeUndefined();
          expect(p.uploadingTerminallyFailed).toBeUndefined();
          expect(p.status?.done).toBeTruthy();
          expect(p.status?.bytesProcessed).toBe("2");
          expect(p.status?.bytesTotal).toBe("2");
          return;
        }

        await c.listen();
      }
    }
  )
})

test('upload a big blob', async () => {
  const lotsOfNumbers: number[] = [];
  for (let i = 0; i < 5000000; i++) {
    lotsOfNumbers.push(i);
  }
  const hugeString = lotsOfNumbers.join(' ');

  withTest(
    hugeString,
    async ({ client, uploader, mtime, fPath, fileSignature }: TestArg) => {
      const uploadId = await createBlobUpload(client, fPath, BigInt(hugeString.length), fileSignature, mtime);
      const handleRes = await getHandleField(client, uploadId);

      const c = computable(
        uploader, {},
        (uploader, ctx) => uploader.getProgressId(handleRes.id, handleRes.type, callerId),
        (val, stable) => uploader.getProgress(val),
      )

      while (true) {
        const p = await c.getValue();

        expect(p.isUpload).toBeTruthy();
        if (p.done) {
          expect(p.isUploadSignMatch).toBeTruthy();
          expect(p.lastError).toBeUndefined();
          expect(p.uploadingTerminallyFailed).toBeUndefined();
          expect(p.status?.done).toBeTruthy();
          expect(p.status?.bytesProcessed).toStrictEqual(p.status?.bytesTotal);
          return;
        }

        await c.listen();
      }
    }
  )
})

test('upload a blob with wrong modification time', async () => {
  withTest(
    '42',
    async ({ client, uploader, mtime, fPath, fileSignature }: TestArg) => {
      const uploadId = await createBlobUpload(
        client, fPath, 2n, fileSignature,
        mtime - 1000n,
      );
      const handleRes = await getHandleField(client, uploadId);

      const c = computable(
        uploader, {},
        (uploader, ctx) => uploader.getProgressId(handleRes.id, handleRes.type, callerId),
        (val, stable) => uploader.getProgress(val),
      )

      while (true) {
        const p = await c.getValue();

        if (p.uploadingTerminallyFailed) {
          expect(p?.lastError).not.toBeUndefined();
          expect(p?.done).toBeFalsy();
          expect(p?.isUpload).toBeTruthy();
          return;
        }

        await c.listen();
      }
    }
  )
})

test('upload a duplicate blob', async () => {
  withTest(
    '42',
    async ({ client, uploader, mtime, fPath, fileSignature }: TestArg) => {
      const uploadId = await createBlobUpload(client, fPath, 2n, fileSignature, mtime);
      const handleRes = await getHandleField(client, uploadId);

      const cOrig = computable(
        uploader, {},
        (uploader, ctx) => uploader.getProgressId(handleRes.id, handleRes.type, callerId),
        (val, stable) => uploader.getProgress(val),
      )

      const cDupl = computable(
        uploader, {},
        (uploader, ctx) => uploader.getProgressId(handleRes.id, handleRes.type, callerId),
        (val, stable) => uploader.getProgress(val),
      )

      while (true) {
        const pOrig = await cOrig.getValue();
        const pDupl = await cDupl.getValue();

        expect(pDupl).toStrictEqual(pOrig);
        expect(pDupl.isUpload).toBeTruthy();
        if (pDupl.done) {
          expect(pDupl.isUploadSignMatch).toBeTruthy();
          expect(pDupl.lastError).toBeUndefined();
          expect(pDupl.uploadingTerminallyFailed).toBeUndefined();
          expect(pDupl.status?.done).toBeTruthy();
          expect(pDupl.status?.bytesProcessed).toBe("2");
          expect(pDupl.status?.bytesTotal).toBe("2");
          return;
        }

        await cDupl.listen();
      }
    }
  )
})

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
  await TestHelpers.withTempRoot(async client => {
    const logger = new ConsoleLoggerAdapter();
    const signFn = await makeGetSignatureFn();
    const uploader = await createUploadDriver(client, logger, signFn);

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test'));
    const fPath = path.join(tmpDir, 'testUploadABlob.txt');
    const data = Buffer.from(new TextEncoder().encode(fileContent));
    await fs.writeFile(fPath, data);
    const f = await fs.open(fPath);
    const stats = await fs.stat(fPath);
    const mtime = BigInt(Math.floor(stats.mtime.getTime() / 1000));
    const sign = await signFn(fPath);

    await cb({ client, uploader, f, fPath, mtime, fileSignature: sign });

    await uploader.releaseAll()
  })
}

async function createBlobUpload(
  c: PlClient,
  path: string,
  sizeBytes: bigint,
  signature: string,
  mTime: bigint,
): Promise<ResourceId> {
  return await c.withWriteTx('UploadDriverCreateTest', async (tx: PlTransaction) => {
    const settings = {
      modificationTime: mTime.toString(),
      localPath: path,
      pathSignature: signature,
      sizeBytes: sizeBytes.toString()
    };
    const data = new TextEncoder().encode(JSON.stringify(settings));
    const upload = tx.createStruct({ name: 'BlobUpload', version: '1' }, data);
    tx.createField({ resourceId: c.clientRoot, fieldName: 'project1' }, 'Dynamic', upload)
    await tx.commit();

    return await upload.globalId;
  }, {});
}

async function getHandleField(client: PlClient, uploadId: ResourceId): Promise<BasicResourceData> {
  return await poll(client, async (tx: PollTxAccessor) => {
    const upload = await tx.get(uploadId);
    const handle = await upload.get('handle');
    return handle.data;
  });
}

