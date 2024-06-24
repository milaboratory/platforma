import {
  BasicResourceData,
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
import { UploadDriver } from './upload';
import { MTimeError } from '../clients/upload';
import {
  createUploadBlobClient,
  createUploadProgressClient
} from '../clients/helpers';

const callerId = 'callerId';

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
      const settings = {
        modificationTime: mTime.toString(),
        localPath: path,
        pathSignature: signature,
        sizeBytes: sizeBytes.toString()
      };
      const data = new TextEncoder().encode(JSON.stringify(settings));
      const upload = tx.createStruct(
        { name: 'BlobUpload', version: '1' },
        data
      );
      tx.createField(
        { resourceId: c.clientRoot, fieldName: 'project1' },
        'Dynamic',
        upload
      );
      await tx.commit();

      return await upload.globalId;
    },
    {}
  );
}

async function getHandleField(
  client: PlClient,
  uploadId: ResourceId
): Promise<BasicResourceData> {
  return await poll(client, async (tx: PollTxAccessor) => {
    const upload = await tx.get(uploadId);
    const handle = await upload.get('handle');
    return handle.data;
  });
}
