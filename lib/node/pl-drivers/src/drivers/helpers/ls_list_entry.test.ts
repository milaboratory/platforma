import { ConsoleLoggerAdapter, HmacSha256Signer } from '@milaboratories/ts-helpers';
import { parseUploadHandle, toFileHandle, toListItem } from './ls_list_entry';
import type { Dirent, Stats } from 'node:fs';
import { ImportFileHandleUpload } from '@milaboratories/pl-model-common';

test('toFileHandle should ok when encode data for UploadBlob', () => {
  const signer = new HmacSha256Signer('abc');

  const handle = toFileHandle({
    storageName: 'library',
    signer,
    remote: false,
    item: {
      directory: 'C:\\programFiles\\',
      name: 'file.txt',
      size: 20n,
      isDir: false,
      fullName: 'C:\\programFiles\\file.txt',
      lastModified: { seconds: 150n, nanos: 260 }
    }
  }) as ImportFileHandleUpload;
  const got = parseUploadHandle(handle);

  expect(got.modificationTime).toEqual('150');
  expect(got.localPath).toEqual('C:\\programFiles\\file.txt');
  expect(got.pathSignature).not.toHaveLength(0);
  expect(got.sizeBytes).toEqual('20');
});

test('toListItem should ok', () => {
  const got = toListItem(new ConsoleLoggerAdapter(), {
    fullName: 'C:\\programFiles\\file.txt',
    dirent: {
      isFile: () => true,
      isDirectory: () => false,
      name: 'file.txt'
    } as Dirent,
    directory: 'C:\\programFiles\\',
    stat: {
      mtimeMs: 150000,
      size: 20
    } as Stats
  });

  expect(got).toMatchObject({
    isDir: false,
    name: 'file.txt',
    fullName: 'C:\\programFiles\\file.txt',
    lastModified: {
      seconds: 150n,
      nanos: 0
    },
    size: 20n
  });
});
