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

test.each(testStorages)('force mode removes deleted packages and versions with $name', async ({ storageProvider }) => {
  const { storage, teardown } = storageProvider();
  const registry = new BlockRegistryV2(storage);
  
  try {
    // Create mock manifests for testing
    const createMockManifest = (org: string, name: string, version: string): BlockPackManifest => ({
      schema: 'v2',
      description: {
        id: { organization: org, name: name, version: version },
        title: `Test ${name}`,
        summary: 'Test package',
        components: {
          workflow: { type: 'workflow-v1', main: { type: 'relative', path: 'workflow.json' } },
          model: { type: 'relative', path: 'model.json' },
          ui: { type: 'relative', path: 'ui.json' }
        },
        meta: {
          title: `Test ${name}`,
          description: 'Test package description',
          organization: {
            name: 'Test Organization',
            url: 'https://test.com'
          },
          tags: []
        }
      },
      files: [
        {
          name: 'model.json',
          size: 13,
          sha256: '6FD977DB9B2AFE87A9CEEE48432881299A6AAF83D935FBBE83007660287F9C2E'
        }
      ]
    });
    
    const mockFileReader = async (fileName: string) => {
      if (fileName === 'model.json') {
        return Buffer.from('{"test":true}');
      }
      throw new Error(`Unknown file: ${fileName}`);
    };
    
    // 1. Publish multiple packages and versions
    const pkg1v1 = createMockManifest('testorg', 'pkg1', '1.0.0');
    const pkg1v2 = createMockManifest('testorg', 'pkg1', '2.0.0'); 
    const pkg2v1 = createMockManifest('testorg', 'pkg2', '1.0.0');
    const pkg3v1 = createMockManifest('anotherorg', 'pkg3', '1.0.0');
    
    await registry.publishPackage(pkg1v1, mockFileReader);
    await registry.publishPackage(pkg1v2, mockFileReader);
    await registry.publishPackage(pkg2v1, mockFileReader);
    await registry.publishPackage(pkg3v1, mockFileReader);
    
    // Update registry to create overviews
    await registry.updateIfNeeded('normal');
    
    // Verify initial state
    let globalOverview = await registry.getGlobalOverview();
    expect(globalOverview?.packages).toHaveLength(3); // testorg:pkg1, testorg:pkg2, anotherorg:pkg3
    
    let pkg1Overview = await registry.getPackageOverview({ organization: 'testorg', name: 'pkg1' });
    expect(pkg1Overview?.versions).toHaveLength(2); // v1.0.0 and v2.0.0
    
    let pkg2Overview = await registry.getPackageOverview({ organization: 'testorg', name: 'pkg2' });
    expect(pkg2Overview?.versions).toHaveLength(1); // v1.0.0
    
    let pkg3Overview = await registry.getPackageOverview({ organization: 'anotherorg', name: 'pkg3' });
    expect(pkg3Overview?.versions).toHaveLength(1); // v1.0.0
    
    // 2. Manually delete some packages/versions from storage (simulating external deletion)
    // Delete pkg1 v1.0.0 
    await storage.deleteFiles('v2/testorg/pkg1/1.0.0/manifest.json', 'v2/testorg/pkg1/1.0.0/model.json');
    
    // Delete entire pkg2
    await storage.deleteFiles('v2/testorg/pkg2/1.0.0/manifest.json', 'v2/testorg/pkg2/1.0.0/model.json');
    
    // Leave pkg1 v2.0.0 and pkg3 v1.0.0 intact
    
    // 3. Count snapshots before force mode
    const initialSnapshots = await storage.listFiles('_overview_snapshots_v2/');
    
    // 4. Run force mode - should create pre-write snapshots and rebuild from scratch
    await registry.updateIfNeeded('force');
    
    // 5. Verify pre-write snapshots were created
    const finalSnapshots = await storage.listFiles('_overview_snapshots_v2/');
    expect(finalSnapshots.length).toBeGreaterThan(initialSnapshots.length);
    
    // Check for pre-write snapshots (should contain "-prewrite-" in filename)
    const preWriteSnapshots = finalSnapshots.filter(s => s.includes('-prewrite-'));
    expect(preWriteSnapshots.length).toBeGreaterThan(0);
    
    // 6. Verify overviews now only reflect what exists in storage
    globalOverview = await registry.getGlobalOverview();
    expect(globalOverview?.packages).toHaveLength(2); // Only testorg:pkg1 and anotherorg:pkg3 should remain
    
    const remainingPackageNames = globalOverview?.packages.map(p => `${p.id.organization}:${p.id.name}`).sort();
    expect(remainingPackageNames).toEqual(['anotherorg:pkg3', 'testorg:pkg1']);
    
    // 7. Verify pkg1 now only has v2.0.0
    pkg1Overview = await registry.getPackageOverview({ organization: 'testorg', name: 'pkg1' });
    expect(pkg1Overview?.versions).toHaveLength(1);
    expect(pkg1Overview?.versions[0].description.id.version).toBe('2.0.0');
    
    // 8. Verify pkg2 overview is unchanged (since pkg2 was completely deleted, 
    // force mode doesn't process it, so the old overview file remains)
    pkg2Overview = await registry.getPackageOverview({ organization: 'testorg', name: 'pkg2' });
    expect(pkg2Overview?.versions).toHaveLength(1); // Old overview remains
    
    // 9. Verify pkg3 is unchanged
    pkg3Overview = await registry.getPackageOverview({ organization: 'anotherorg', name: 'pkg3' });
    expect(pkg3Overview?.versions).toHaveLength(1);
    expect(pkg3Overview?.versions[0].description.id.version).toBe('1.0.0');
    
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
