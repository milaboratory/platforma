import { ConsoleLoggerAdapter, HmacSha256Signer } from '@milaboratories/ts-helpers';
import { LsDriver } from './ls';
import { createLsFilesClient } from '../clients/helpers';
import { TestHelpers } from '@milaboratories/pl-client';
import * as os from 'node:os';
import * as path from 'node:path';
import { test, expect } from '@jest/globals';
import { isImportFileHandleIndex, isImportFileHandleUpload } from '@milaboratories/pl-model-common';
import { DefaultVirtualLocalStorages } from './virtual_storages';

const assetsPath = path.resolve('../../../assets');

test('should ok when get all storages from ls driver', async () => {
  const signer = new HmacSha256Signer('abc');
  const logger = new ConsoleLoggerAdapter();
  await TestHelpers.withTempRoot(async (client) => {
    const lsClient = createLsFilesClient(client, logger);
    const driver = await LsDriver.init(logger, client, signer, [], () => {
      throw Error();
    });

    const got = await driver.getStorageList();

    expect(got.length).toBeGreaterThanOrEqual(1);
    expect(got.find((se) => se.name == 'library')?.handle).toContain('library');
    expect(got.find((se) => se.name == 'library')?.initialFullPath).toEqual('');
    expect(got.find((se) => se.name == 'local')?.handle).toContain('/');
    expect(got.find((se) => se.name == 'local')?.initialFullPath).toEqual(os.homedir());

    console.log('got all storage entries: ', got);
  });
});

test('should ok when list files from remote storage in ls driver', async () => {
  const signer = new HmacSha256Signer('abc');
  const logger = new ConsoleLoggerAdapter();
  await TestHelpers.withTempRoot(async (client) => {
    const driver = await LsDriver.init(logger, client, signer, [], () => {
      throw Error();
    });

    const storages = await driver.getStorageList();
    const library = storages.find((se) => se.name == 'library')!.handle;

    const topLevelDir = await driver.listFiles(library, '');
    expect(topLevelDir.entries.length).toBeGreaterThan(1);

    const testDir = topLevelDir.entries.find((d) => d.name.includes('ls_dir_structure'));
    expect(testDir).toBeDefined();
    expect(testDir!.type).toEqual('dir');
    expect(testDir!.fullPath).toEqual('/ls_dir_structure_test');
    expect(testDir!.name).toEqual('ls_dir_structure_test');

    const secondDirs = await driver.listFiles(library, testDir!.fullPath);
    expect(secondDirs.entries).toHaveLength(2);
    expect(secondDirs.entries[0].type).toEqual('dir');
    expect(secondDirs.entries[0].fullPath).toEqual('/ls_dir_structure_test/abc');
    expect(secondDirs.entries[0].name).toEqual('abc');

    const f = await driver.listFiles(library, secondDirs.entries[0].fullPath);
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
    const driver = await LsDriver.init(logger, client, signer, [], () => {
      throw Error();
    });

    const storages = await driver.getStorageList();
    const local = storages.find((se) => se.name == 'local')!;

    const defaultDir = await driver.listFiles(local.handle, local.initialFullPath);
    expect(defaultDir.entries.length).toBeGreaterThan(1);
  });
});

test('should ok when list files from local storage in ls driver and correctly apply local projections', async () => {
  const signer = new HmacSha256Signer('abc');
  const logger = new ConsoleLoggerAdapter();
  await TestHelpers.withTempRoot(async (client) => {
    let dialogRet = '';
    const driver = await LsDriver.init(
      logger,
      client,
      signer,
      [{ storageId: 'test_storage', localPath: path.join(assetsPath, 'ls_dir_structure_test') }],
      async () => [dialogRet]
    );

    const storages = await driver.getStorageList();
    const local = storages.find((se) => se.name == 'local')!;

    {
      dialogRet = path.join(assetsPath, 'ls_dir_structure_test', 'abc', '42.txt');
      const result = await driver.showOpenSingleFileDialog();
      expect(result.file).toBeDefined();

      expect(isImportFileHandleIndex(result.file!)).toStrictEqual(true);
      const size = await driver.getLocalFileSize(result.file!);
      expect(size).toStrictEqual(3);
      const content = await driver.getLocalFileContent(result.file!);
      expect(Buffer.from(content).toString()).toStrictEqual('42\n');
    }

    {
      dialogRet = path.join(assetsPath, 'answer_to_the_ultimate_question.txt');
      const result = await driver.showOpenSingleFileDialog();
      expect(result.file).toBeDefined();

      expect(isImportFileHandleUpload(result.file!)).toStrictEqual(true);
      const size = await driver.getLocalFileSize(result.file!);
      expect(size).toStrictEqual(3);
      const content = await driver.getLocalFileContent(result.file!);
      expect(Buffer.from(content).toString()).toStrictEqual('42\n');
    }
  });
});

test('should ok when get file using local dialog, and read its content', async () => {
  const signer = new HmacSha256Signer('abc');
  const logger = new ConsoleLoggerAdapter();
  await TestHelpers.withTempRoot(async (client) => {
    const driver = await LsDriver.init(logger, client, signer, [], async () => [
      path.join(assetsPath, 'answer_to_the_ultimate_question.txt')
    ]);

    const result = await driver.showOpenSingleFileDialog();
    expect(result.file).toBeDefined();

    const size = await driver.getLocalFileSize(result.file!);
    expect(size).toStrictEqual(3);
    const content = await driver.getLocalFileContent(result.file!);
    expect(Buffer.from(content).toString()).toStrictEqual('42\n');

    const multiResult = await driver.showOpenMultipleFilesDialog();
    expect(multiResult.files![0]).toStrictEqual(result.file);
  });
});
