import { test, expect } from '@jest/globals';
import { RegistryStorage, storageByUrl } from '../../io';
import { randomUUID } from 'crypto';
import path from 'path';
import fsp from 'fs/promises';
import { BlockRegistryV2 } from './registry';
import semver from 'semver';
import { UpdateSuggestions, BlockPackManifest } from '@milaboratories/pl-model-middle-layer';
import { inferUpdateSuggestions } from './registry_reader';
import { OverviewSnapshotsPrefix } from './schema_internal';

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

test.each(testStorages)('registry snapshots test with $name', async ({ storageProvider }) => {
  const { storage, teardown } = storageProvider();
  const registry = new BlockRegistryV2(storage);
  
  try {
    // Force an update to trigger snapshot creation (even with empty registry)
    await registry.updateIfNeeded('force');
    
    // Check that snapshot files actually exist in storage
    const snapshotFiles = await storage.listFiles(OverviewSnapshotsPrefix);
    expect(snapshotFiles.length).toBeGreaterThan(0);
    
    // Check that snapshots were created
    const snapshots = await registry.listGlobalOverviewSnapshots();
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots[0]).toHaveProperty('timestamp');
    expect(snapshots[0]).toHaveProperty('path');
    expect(snapshots[0].path).toMatch(/^_overview_snapshots_v2\/global\/.*\.json\.gz$/);
    
    // Test that global overview files exist (should be empty initially)
    const globalOverview = await registry.getGlobalOverview();
    expect(globalOverview).toBeDefined();
    expect(globalOverview?.packages).toHaveLength(0);
    
    // Test restore functionality
    const snapshotId = snapshots[0].timestamp;
    await registry.restoreGlobalOverviewFromSnapshot(snapshotId);
    
    // Verify restored overview is still valid
    const restoredOverview = await registry.getGlobalOverview();
    expect(restoredOverview).toBeDefined();
    expect(restoredOverview?.packages).toHaveLength(0);
    
  } finally {
    await teardown();
  }
});

test.each(testStorages)('registry snapshots disabled test with $name', async ({ storageProvider }) => {
  const { storage, teardown } = storageProvider();
  const registry = new BlockRegistryV2(storage, undefined, { skipSnapshotCreation: true });
  
  try {
    // Force an update which would normally create snapshots
    await registry.updateIfNeeded('force');
    
    // Check that no snapshots were created
    const snapshots = await registry.listGlobalOverviewSnapshots();
    expect(snapshots).toHaveLength(0);
    
    const snapshotFiles = await storage.listFiles(OverviewSnapshotsPrefix);
    expect(snapshotFiles).toHaveLength(0);
    
  } finally {
    await teardown();
  }
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
