import {
  ConsoleLoggerAdapter,
  HmacSha256Signer
} from '@milaboratory/ts-helpers';
import { fromFileHandle, LsDriver, toFileHandle, toListItem } from './ls';
import { createLsFilesClient } from '../clients/helpers';
import { TestHelpers } from '@milaboratory/pl-client-v2';
import type { Dirent, Stats } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

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
  });
  const got = fromFileHandle(handle);

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

test('should ok when get all storages from ls driver', async () => {
  const signer = new HmacSha256Signer('abc');
  const logger = new ConsoleLoggerAdapter();
  await TestHelpers.withTempRoot(async (client) => {
    const lsClient = createLsFilesClient(client, logger);
    const driver = new LsDriver(logger, lsClient, client, signer, {
      local: os.homedir()
    });

    const got = await driver.getStorageList();

    expect(got.length).toBeGreaterThanOrEqual(1);
    expect(got.find((se) => se.name == 'library')?.handle).toContain('library');
    expect(got.find((se) => se.name == 'library')?.initialFullPath).toEqual('');
    expect(got.find((se) => se.name == 'local')?.handle).toContain('/');
    expect(got.find((se) => se.name == 'local')?.initialFullPath).toEqual(
      os.homedir()
    );

    console.log('got all storage entries: ', got);
  });
});

test('should ok when list files from remote storage in ls driver', async () => {
  const signer = new HmacSha256Signer('abc');
  const logger = new ConsoleLoggerAdapter();
  await TestHelpers.withTempRoot(async (client) => {
    const lsClient = createLsFilesClient(client, logger);
    const driver = new LsDriver(logger, lsClient, client, signer, {
      local: os.homedir()
    });

    const storages = await driver.getStorageList();
    const library = storages.find((se) => se.name == 'library')!.handle;

    const topLevelDir = await driver.listFiles(library, '');
    expect(topLevelDir.entries.length).toBeGreaterThan(1);

    const testDir = topLevelDir.entries.find((d) =>
      d.name.includes('ls_dir_structure')
    );
    expect(testDir).toBeDefined();
    expect(testDir!.type).toEqual('dir');
    expect(testDir!.fullPath).toEqual('/ls_dir_structure_test');
    expect(testDir!.name).toEqual('ls_dir_structure_test');

    const secondDirs = await driver.listFiles(library, testDir!.fullPath);
    expect(secondDirs.parent).toEqual('/ls_dir_structure_test/');
    expect(secondDirs.entries).toHaveLength(2);
    expect(secondDirs.entries[0].type).toEqual('dir');
    expect(secondDirs.entries[0].fullPath).toEqual(
      '/ls_dir_structure_test/abc'
    );
    expect(secondDirs.entries[0].name).toEqual('abc');

    const f = await driver.listFiles(library, secondDirs.entries[0].fullPath);
    expect(f.parent).toEqual('/ls_dir_structure_test/abc/');
    expect(f.entries).toHaveLength(1);
    expect(f.entries[0].type).toEqual('file');
    expect(f.entries[0].fullPath).toEqual('/ls_dir_structure_test/abc/42.txt');
    expect(f.entries[0].name).toEqual('42.txt');
    expect((f.entries[0] as any).handle).toContain('index://index/');
  });
});

test('should ok when list files from local storage in ls driver', async () => {
  const signer = new HmacSha256Signer('abc');
  const logger = new ConsoleLoggerAdapter();
  await TestHelpers.withTempRoot(async (client) => {
    const lsClient = createLsFilesClient(client, logger);
    const driver = new LsDriver(logger, lsClient, client, signer, {
      local: os.homedir()
    });

    const storages = await driver.getStorageList();
    const local = storages.find((se) => se.name == 'local')!.handle;

    const topLevelDir = await driver.listFiles(local, '');
    expect(topLevelDir.entries.length).toBeGreaterThan(1);
  });
});
