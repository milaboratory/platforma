import type { PlClient} from '@milaboratories/pl-client';
import { TestHelpers } from '@milaboratories/pl-client';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConsoleLoggerAdapter } from '@milaboratories/ts-helpers';
import type { GrpcTransport } from '@protobuf-ts/grpc-transport';
import type { Dispatcher } from 'undici';
import { text } from 'node:stream/consumers';
import { ClientDownload } from '../clients/download';

test('client download from a local file', async () => {
  await TestHelpers.withTempRoot(async (client) => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'test'));
    const fName = 'answer_to_the_ultimate_question.txt';

    const data = Buffer.from(new TextEncoder().encode('42'));

    const fPath = path.join(storageRoot, fName);
    await fs.writeFile(fPath, data);

    const clientDownload = client.getDriver({
      name: 'ClientDownload',
      init: (
        pl: PlClient,
        grpcTransport: GrpcTransport,
        httpDispatcher: Dispatcher
      ) =>
        new ClientDownload(
          grpcTransport,
          httpDispatcher,
          new ConsoleLoggerAdapter(),
          { tmp: storageRoot }
        )
    });

    const localFile = await clientDownload.readLocalFile(
      `storage://tmp/${fName}`
    );

    expect(localFile.size).toBe(2);
    expect(await text(localFile.content)).toBe('42');

    await fs.rm(fPath);
  });
});
