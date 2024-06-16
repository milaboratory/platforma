import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { RegistryStorage, S3Storage, storageByUrl } from './storage';
import fs from 'node:fs';
import { BlockRegistry } from './registry';
import { TestLogger } from './cmd';

type TestStorageInstance = {
  storage: RegistryStorage,
  teardown: () => Promise<void>
}
type TestStorageTarget = {
  name: string,
  storageProvider: () => TestStorageInstance,
}
const testStorages: TestStorageTarget[] = [
  {
    name: 'local', storageProvider: () => {
      const uuid = randomUUID().toString();
      const tmp = path.resolve('tmp');
      const storage = storageByUrl('file://' + path.resolve(tmp, uuid));
      return {
        storage, teardown: async () => {
          await fs.promises.rm(tmp, { recursive: true, force: true });
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
        storage, teardown: async () => {
          const allFiles = await storage.listFiles('');
          console.log('Deleting: ', allFiles);
          await storage.deleteFiles(...allFiles);
        }
      };
    }
  });
}

test.each(testStorages)('basic registry test with $name', async ({ storageProvider }) => {
  const { storage, teardown } = storageProvider();
  const registry = new BlockRegistry(storage, new TestLogger());
  await registry.updateIfNeeded();
  const constructor1 = registry.constructNewPackage({ organization: 'org1', package: 'pkg1', version: '1.1.0' });
  await constructor1.writeMeta({ some: 'value1' });
  await constructor1.finish();
  await registry.updateIfNeeded();
  const constructor2 = registry.constructNewPackage({ organization: 'org1', package: 'pkg1', version: '1.2.0' });
  await constructor2.writeMeta({ some: 'value2' });
  await constructor2.finish();
  await registry.updateIfNeeded();
  expect(await registry.getPackageOverview({ organization: 'org1', package: 'pkg1' })).toEqual(
    [
      { version: '1.2.0', meta: { some: 'value2' } },
      { version: '1.1.0', meta: { some: 'value1' } }
    ]
  );
  expect(await registry.getGlobalOverview()).toEqual([
      {
        organization: 'org1',
        package: 'pkg1',
        allVersions: ['1.1.0', '1.2.0'],
        latestVersion: '1.2.0',
        latestMeta: { some: 'value2' }
      }
    ]
  );
  await teardown();
});

test.each(testStorages)('package modification test with $name', async ({ storageProvider }) => {
  const { storage, teardown } = storageProvider();
  const registry = new BlockRegistry(storage, new TestLogger());
  const constructor1 = registry.constructNewPackage({ organization: 'org1', package: 'pkg1', version: '1.1.0' });
  await constructor1.writeMeta({ some: 'value1' });
  await constructor1.finish();
  const constructor2 = registry.constructNewPackage({ organization: 'org1', package: 'pkg1', version: '1.1.0' });
  await constructor2.writeMeta({ some: 'value2' });
  await constructor2.finish();
  await registry.updateIfNeeded();
  expect(await registry.getPackageOverview({ organization: 'org1', package: 'pkg1' })).toEqual(
    [
      { version: '1.1.0', meta: { some: 'value2' } }
    ]
  );
  expect(await registry.getGlobalOverview()).toEqual([
      {
        organization: 'org1',
        package: 'pkg1',
        allVersions: ['1.1.0'],
        latestVersion: '1.1.0',
        latestMeta: { some: 'value2' }
      }
    ]
  );
  await teardown();
});
