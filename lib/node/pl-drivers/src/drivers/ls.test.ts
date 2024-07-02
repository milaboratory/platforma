import * as sdk from '@milaboratory/sdk-model';
import {
  ConsoleLoggerAdapter,
  HmacSha256Signer
} from '@milaboratory/ts-helpers';
import { fromFileHandle, LsDriver, toFileHandle } from './ls';
import { createLsFilesClient } from '../clients/helpers';
import { TestHelpers } from '@milaboratory/pl-client-v2';

test('toFileHandle should ok when encode data for UploadBlob', () => {
  const signer = new HmacSha256Signer('abc');

  const handle = toFileHandle({
    storageName: 'library',
    signer,
    remote: true,
    item: {
      name: 'file.txt',
      size: 20n,
      isDir: false,
      fullName: 'C:\\programFiles\\file.txt',
      directory: 'programFiles',
      lastModified: { seconds: 150n, nanos: 260 },
      version: '1'
    }
  });
  const got = fromFileHandle(handle);

  expect(got.modificationTimeUnix).toEqual('150');
  expect(got.localPath).toEqual('C:\\programFiles\\file.txt');
  expect(got.pathSignature).not.toHaveLength(0);
  expect(got.sizeBytes).toEqual('20');
});

test('should ok when get all storages from ls driver', async () => {
  const signer = new HmacSha256Signer('abc');
  const logger = new ConsoleLoggerAdapter();
  await TestHelpers.withTempRoot(async (client) => {
    const lsClient = createLsFilesClient(client, logger);
    const driver = new LsDriver(lsClient, client, signer);

    const got = await driver.getStorageList();

    expect(got.length).toBeGreaterThanOrEqual(1);
    expect(got.find((se) => se.name == 'library')?.handle).toContain('library');
  });
});

test('should ok when list files from ls driver', async () => {
  const signer = new HmacSha256Signer('abc');
  const logger = new ConsoleLoggerAdapter();
  await TestHelpers.withTempRoot(async (client) => {
    const lsClient = createLsFilesClient(client, logger);
    const driver = new LsDriver(lsClient, client, signer);

    const storages = await driver.getStorageList();
    const library = storages.find((se) => se.name == 'library')!.handle;

    const topLevelDir = await driver.listFiles(library, '');
    expect(topLevelDir.length).toBeGreaterThan(1);

    const testDir = topLevelDir.find((d) =>
      d.name.includes('ls_dir_structure')
    );
    expect(testDir!.type).toEqual('dir');
    expect(testDir!.fullPath).toEqual('/ls_dir_structure_test');
    expect(testDir!.name).toEqual('ls_dir_structure_test');

    const secondDirs = await driver.listFiles(library, testDir!.fullPath);
    expect(secondDirs).toHaveLength(2);
    expect(secondDirs[0].type).toEqual('dir');
    expect(secondDirs[0].fullPath).toEqual('/ls_dir_structure_test/abc');
    expect(secondDirs[0].name).toEqual('abc');

    const f = await driver.listFiles(library, secondDirs[0].fullPath);
    expect(f).toHaveLength(1);
    expect(f[0].type).toEqual('file');
    expect(f[0].fullPath).toEqual('/ls_dir_structure_test/abc/42.txt');
    expect(f[0].name).toEqual('42.txt');
    expect((f[0] as any).handle).toContain('upload://upload/');
  });
});
