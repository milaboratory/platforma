import { PlClient, TestHelpers } from '@milaboratories/pl-client';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConsoleLoggerAdapter } from '@milaboratories/ts-helpers';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import { Dispatcher } from 'undici';
import { text } from 'node:stream/consumers';
import { ClientDownload, getFullPath, parseLocalUrl } from '../clients/download';
import { test, expect } from '@jest/globals';

test('should parse local file url even on Windows', () => {
  const url =
    'storage://main/67z%5C2vy%5C65i%5C67z2vy65i0xwhjwsfsef_ex3k3hxe7qdc2cvtdfkdnhdp9kwlt7-7dmcy0kthe6u.json';
  const expectedFullPath =
    'C:\\Users\\test\\67z\\2vy\\65i\\67z2vy65i0xwhjwsfsef_ex3k3hxe7qdc2cvtdfkdnhdp9kwlt7-7dmcy0kthe6u.json';

  const got = parseLocalUrl(url);
  const fullPath = getFullPath(
    got.storageId,
    new Map([['main', 'C:\\Users\\test']]),
    got.relativePath
  ).replace(path.sep, '\\'); // for testing on *nix systems

  expect(fullPath).toEqual(expectedFullPath);
});

test('client download from a local file', async () => {
  await TestHelpers.withTempRoot(async (client) => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'test'));
    const fName = 'answer_to_the_ultimate_question.txt';

    const data = Buffer.from(new TextEncoder().encode('42'));

    const fPath = path.join(storageRoot, fName);
    await fs.writeFile(fPath, data);

    const clientDownload = client.getDriver({
      name: 'ClientDownload',
      init: (pl: PlClient, grpcTransport: GrpcTransport, httpDispatcher: Dispatcher) =>
        new ClientDownload(grpcTransport, httpDispatcher, new ConsoleLoggerAdapter(), [
          { storageId: 'tmp', localPath: storageRoot }
        ])
    });

    const localFile = await clientDownload.readLocalFile(`storage://tmp/${fName}`);

    expect(localFile.size).toBe(2);
    expect(await text(localFile.content)).toBe('42');

    await fs.rm(fPath);
  });
});
