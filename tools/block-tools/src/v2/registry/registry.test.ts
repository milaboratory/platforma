import { test, expect } from '@jest/globals';
import { RegistryStorage, storageByUrl } from '../../io';
import { randomUUID } from 'crypto';
import path from 'path';
import fsp from 'fs/promises';
import { BlockRegistryV2 } from './registry';
import semver from 'semver';
import { UpdateSuggestions } from '@milaboratories/pl-model-middle-layer';
import { inferUpdateSuggestions } from './registry_reader';

type TestStorageInstance = {
  storage: RegistryStorage;
  teardown: () => Promise<void>;
};
type TestStorageTarget = {
  name: string;
  storageProvider: () => TestStorageInstance;
};
const testStorages: TestStorageTarget[] = [
  {
    name: 'local',
    storageProvider: () => {
      const uuid = randomUUID().toString();
      const tmp = path.resolve('tmp');
      const storagePath = path.resolve(tmp, uuid);
      const storage = storageByUrl('file://' + storagePath);
      return {
        storage,
        teardown: async () => {
          await fsp.rm(storagePath, { recursive: true, force: true });
        }
      };
    }
  }
];

const testS3Address = process.env.TEST_S3_ADDRESS;
if (testS3Address !== undefined) {
  testStorages.push({
    name: 's3',
    storageProvider: () => {
      const uuid = randomUUID().toString();
      const testS3AddressURL = new URL(testS3Address!);
      testS3AddressURL.pathname = `${testS3AddressURL.pathname.replace(/\/$/, '')}/${uuid}`;
      const storage = storageByUrl(testS3AddressURL.toString());
      return {
        storage,
        teardown: async () => {
          const allFiles = await storage.listFiles('');
          console.log('Deleting: ', allFiles);
          await storage.deleteFiles(...allFiles);
        }
      };
    }
  });
}

test.each(testStorages)('full registry test with $name', async ({ storageProvider }) => {
  const { storage, teardown } = storageProvider();
  const registry = new BlockRegistryV2(storage);
  registry.updateIfNeeded;
  await teardown();
});

test.each([
  {
    name: 'test1',
    current: '1.2.3',
    available: ['1.1.2', '1.2.3', '1.2.4', '1.2.5', '1.3.4', '1.3.5', '3.4.1', '3.4.2'],
    expected: [
      { type: 'patch', update: '1.2.5' },
      { type: 'minor', update: '1.3.5' },
      { type: 'major', update: '3.4.2' }
    ]
  },
  {
    name: 'test2',
    current: '1.2.3',
    available: ['1.1.2', '1.2.3', '1.3.4', '1.3.5', '3.4.1', '3.4.2'],
    expected: [
      { type: 'minor', update: '1.3.5' },
      { type: 'major', update: '3.4.2' }
    ]
  },
  {
    name: 'test3',
    current: '1.2.3',
    available: ['1.1.2', '1.2.3', '1.2.4', '1.2.5', '3.4.1', '3.4.2'],
    expected: [
      { type: 'patch', update: '1.2.5' },
      { type: 'major', update: '3.4.2' }
    ]
  },
  {
    name: 'test4',
    current: '1.2.3',
    available: ['1.1.2', '1.2.3', '1.2.4', '1.3.0', '2.0.0'],
    expected: [
      { type: 'patch', update: '1.2.4' },
      { type: 'minor', update: '1.3.0' },
      { type: 'major', update: '2.0.0' }
    ]
  }
] as { name: string; current: string; available: string[]; expected: UpdateSuggestions<string> }[])(
  'infer updates test $name',
  ({ current, available, expected }) => {
    const a = [...available];
    a.reverse();
    expect(inferUpdateSuggestions(current, a)).toStrictEqual(expected);
  }
);
