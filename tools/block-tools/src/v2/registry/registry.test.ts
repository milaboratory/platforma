import { test, expect } from '@jest/globals';
import { RegistryStorage, storageByUrl } from '../../io';
import { randomUUID } from 'crypto';
import path from 'path';
import fsp from 'fs/promises';
import { BlockRegistryV2 } from './registry';

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
  registry.updateIfNeeded
  await teardown();
});
