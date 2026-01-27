import { blockSpec as enterNumberSpec } from '@milaboratories/milaboratories.test-enter-numbers-v3';
import type { Project } from '@milaboratories/pl-middle-layer';
import { parseJson } from '@milaboratories/pl-model-common';
import { BLOCK_STORAGE_KEY, deriveDataFromStorage, type StorageDebugView } from '@platforma-sdk/model';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import { withMl } from './with-ml';
import { createProjectWatcher } from './test-helpers';
import type { BlockDumpUnified } from './unified-state-schema';
import { BlockDumpArraySchemaUnified } from './unified-state-schema';

/**
 * Creates a raw BlockStorage JSON string with the given data and version.
 * This simulates storage in the old format before a migration.
 */
function createRawBlockStorage(data: unknown, dataVersion: string): string {
  return JSON.stringify({
    [BLOCK_STORAGE_KEY]: 'v1',
    __dataVersion: dataVersion,
    __data: data,
  });
}

/**
 * Triggers a block pack update by touching the model file and waiting for detection.
 * Returns the updatedBlockPack or undefined if no update was detected.
 */
async function triggerBlockPackUpdate(prj: Project): Promise<void> {
  await fs.promises.appendFile(
    path.resolve('..', '..', 'etc', 'blocks', 'enter-numbers-v3', 'model', 'dist', 'model.json'),
    ' ',
  );
  await prj.overview.refreshState();
}

// =============================================================================
// Migration Tests for enter-numbers-v3 block
//
// Block has 2 migrations:
//   - migration[0]: v1 → v2 (adds labels field)
//   - migration[1]: v2 → v3 (adds description field)
//
// State versions:
//   - v1: { numbers: number[] }
//   - v2: { numbers: number[], labels: string[] }
//   - v3: { numbers: number[], labels: string[], description: string }
//
// Target version = v3
// =============================================================================

test('v3: fresh block has correct initial dataVersion', async ({ expect }) => {
  await withMl(async (ml, workFolder) => {
    const pRid1 = await ml.createProject({ label: 'Fresh Block Test' }, 'migration-fresh');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    // Add a fresh block
    const block1Id = await prj.addBlock('Block 1', enterNumberSpec);

    // Create project watcher to track blockStorage
    const projectWatcher = await createProjectWatcher<BlockDumpUnified>(ml, prj, {
      workFolder,
      validator: BlockDumpArraySchemaUnified,
    });

    // Get initial overview and wait for block state to stabilize
    const overview = await prj.overview.awaitStableValue();
    expect(overview.blocks[0].storageDebugView).toBeDefined();

    // Fresh block should have dataVersion = v3 (latest version key) - check via overview
    const storageInfo = parseJson<StorageDebugView>(overview.blocks[0].storageDebugView!);
    console.log('[Fresh Block Test] dataVersion:', storageInfo.dataVersion);
    expect(storageInfo.dataVersion).toBe('v3');

    // Get the actual state to verify it's the initial state
    const blockState = await prj.getBlockState(block1Id).awaitStableValue();
    console.log('[Fresh Block Test] data:', deriveDataFromStorage(blockState.blockStorage));
    expect(deriveDataFromStorage(blockState.blockStorage)).toStrictEqual({
      numbers: [],
      labels: [],
      description: '',
    });

    // Give watcher time to sync and log blockStorage via watcher
    await new Promise((resolve) => setTimeout(resolve, 200));
    const blockDump = projectWatcher.getBlockDump(block1Id);
    console.log('[Fresh Block Test] blockStorage dump:', JSON.stringify(blockDump?.blockStorage, null, 2));

    // Verify blockStorage data matches expected structure (if watcher has synced)
    const blockStorageData = blockDump?.blockStorage?.data as Record<string, unknown> | undefined;
    if (blockStorageData !== undefined) {
      expect(blockStorageData[BLOCK_STORAGE_KEY]).toBe('v1');
      expect(blockStorageData.__dataVersion).toBe('v3');
    }

    await projectWatcher.abort();
  });
});

test('v3: migration from v1 to v3 (two migrations)', async ({ expect }) => {
  await withMl(async (ml, workFolder) => {
    const pRid1 = await ml.createProject({ label: 'Migration v1→v3 Test' }, 'migration-v1-v3');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    const tmpDevBlockFolder = path.resolve(workFolder, 'dev');
    await fs.promises.mkdir(tmpDevBlockFolder, { recursive: true });

    // Add a block
    const block1Id = await prj.addBlock('Block 1', enterNumberSpec);

    // Create project watcher to track blockStorage
    const projectWatcher = await createProjectWatcher<BlockDumpUnified>(ml, prj, {
      workFolder,
      validator: BlockDumpArraySchemaUnified,
    });

    // Set raw storage with v1 state (only numbers, no labels or description)
    const v1State = { numbers: [3, 1, 2] };
    const v1Storage = createRawBlockStorage(v1State, 'v1');
    console.log('[v1→v3 Test] Setting v1 storage:', v1Storage);
    await prj.setBlockStorageRaw(block1Id, v1Storage);

    // Verify storage was set - log full blockStorage
    const overview1 = await prj.overview.awaitStableValue();
    const storageInfo1 = parseJson<StorageDebugView>(overview1.blocks[0].storageDebugView!);
    expect(storageInfo1.dataVersion).toBe('v1');

    // Log blockStorage after setting v1 state
    const blockDump1 = projectWatcher.getBlockDump(block1Id);
    console.log('[v1→v3 Test] Step 1 - After setting v1 storage:');
    console.log('  blockStorage:', JSON.stringify(blockDump1?.blockStorage?.data, null, 2));

    // Trigger block pack update
    await triggerBlockPackUpdate(prj);

    const overview2 = await prj.overview.awaitStableValue();
    expect(overview2.blocks[0].updatedBlockPack).toBeDefined();

    // Log blockStorage before migration
    const blockDump2 = projectWatcher.getBlockDump(block1Id);
    console.log('[v1→v3 Test] Step 2 - Before migration (updatedBlockPack available):');
    console.log('  blockStorage:', JSON.stringify(blockDump2?.blockStorage?.data, null, 2));

    // Apply update - this should run both migrations (v1→v2→v3)
    console.log('[v1→v3 Test] Step 3 - Triggering block pack update...');
    await prj.updateBlockPack(block1Id, overview2.blocks[0].updatedBlockPack!);

    // Verify migration ran and state version is now v3
    const overview3 = await prj.overview.awaitStableValue();
    const storageInfo3 = parseJson<StorageDebugView>(overview3.blocks[0].storageDebugView!);
    console.log('[v1→v3 Test] After migration, dataVersion:', storageInfo3.dataVersion);
    expect(storageInfo3.dataVersion).toBe('v3');

    // Wait for watcher to sync
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Log blockStorage after migration
    const blockDump3 = projectWatcher.getBlockDump(block1Id);
    console.log('[v1→v3 Test] Step 4 - After migration:');
    console.log('  blockStorage:', JSON.stringify(blockDump3?.blockStorage?.data, null, 2));

    // Verify blockStorage structure after migration
    const blockStorageData3 = blockDump3?.blockStorage?.data as Record<string, unknown> | undefined;
    expect(blockStorageData3?.[BLOCK_STORAGE_KEY]).toBe('v1');
    expect(blockStorageData3?.__dataVersion).toBe('v3');

    // Check the migrated state
    const blockState = await prj.getBlockState(block1Id).awaitStableValue();
    console.log('[v1→v3 Test] Migrated state:', deriveDataFromStorage(blockState.blockStorage));

    // After migration:
    // - numbers should be sorted: [1, 2, 3]
    // - labels should be ['migrated-from-v1'] (from migration[0])
    // - description should be 'Migrated: migrated-from-v1' (from migration[1])
    expect(deriveDataFromStorage(blockState.blockStorage)).toStrictEqual({
      numbers: [1, 2, 3],
      labels: ['migrated-from-v1'],
      description: 'Migrated: migrated-from-v1',
    });

    await projectWatcher.abort();
  });
});

test('v3: migration from v2 to v3 (one migration)', async ({ expect }) => {
  await withMl(async (ml, workFolder) => {
    const pRid1 = await ml.createProject({ label: 'Migration v2→v3 Test' }, 'migration-v2-v3');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    const tmpDevBlockFolder = path.resolve(workFolder, 'dev');
    await fs.promises.mkdir(tmpDevBlockFolder, { recursive: true });

    // Add a block
    const block1Id = await prj.addBlock('Block 1', enterNumberSpec);

    // Create project watcher to track blockStorage
    const projectWatcher = await createProjectWatcher<BlockDumpUnified>(ml, prj, {
      workFolder,
      validator: BlockDumpArraySchemaUnified,
    });

    // Set raw storage with v2 state (numbers + labels, no description)
    const v2State = { numbers: [10, 20, 30], labels: ['custom-label-1', 'custom-label-2'] };
    const v2Storage = createRawBlockStorage(v2State, 'v2');
    console.log('[v2→v3 Test] Setting v2 storage:', v2Storage);
    await prj.setBlockStorageRaw(block1Id, v2Storage);

    // Verify storage was set - log full blockStorage
    const overview1 = await prj.overview.awaitStableValue();
    const storageInfo1 = parseJson<StorageDebugView>(overview1.blocks[0].storageDebugView!);
    expect(storageInfo1.dataVersion).toBe('v2');

    // Log blockStorage after setting v2 state
    const blockDump1 = projectWatcher.getBlockDump(block1Id);
    console.log('[v2→v3 Test] Step 1 - After setting v2 storage:');
    console.log('  blockStorage:', JSON.stringify(blockDump1?.blockStorage?.data, null, 2));

    // Trigger block pack update
    await triggerBlockPackUpdate(prj);

    const overview2 = await prj.overview.awaitStableValue();
    expect(overview2.blocks[0].updatedBlockPack).toBeDefined();

    // Log blockStorage before migration
    const blockDump2 = projectWatcher.getBlockDump(block1Id);
    console.log('[v2→v3 Test] Step 2 - Before migration (updatedBlockPack available):');
    console.log('  blockStorage:', JSON.stringify(blockDump2?.blockStorage?.data, null, 2));

    // Apply update - this should run only migration[1] (v2→v3)
    console.log('[v2→v3 Test] Step 3 - Triggering block pack update...');
    await prj.updateBlockPack(block1Id, overview2.blocks[0].updatedBlockPack!);

    // Verify migration ran and state version is now v3
    const overview3 = await prj.overview.awaitStableValue();
    const storageInfo3 = parseJson<StorageDebugView>(overview3.blocks[0].storageDebugView!);
    console.log('[v2→v3 Test] After migration, dataVersion:', storageInfo3.dataVersion);
    expect(storageInfo3.dataVersion).toBe('v3');

    // Wait for watcher to sync
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Log blockStorage after migration
    const blockDump3 = projectWatcher.getBlockDump(block1Id);
    console.log('[v2→v3 Test] Step 4 - After migration:');
    console.log('  blockStorage:', JSON.stringify(blockDump3?.blockStorage?.data, null, 2));

    // Verify blockStorage structure after migration
    const blockStorageData3 = blockDump3?.blockStorage?.data as Record<string, unknown> | undefined;
    expect(blockStorageData3?.[BLOCK_STORAGE_KEY]).toBe('v1');
    expect(blockStorageData3?.__dataVersion).toBe('v3');

    // Check the migrated state
    const blockState = await prj.getBlockState(block1Id).awaitStableValue();
    console.log('[v2→v3 Test] Migrated state:', deriveDataFromStorage(blockState.blockStorage));

    // After migration:
    // - numbers should be preserved: [10, 20, 30]
    // - labels should be preserved: ['custom-label-1', 'custom-label-2']
    // - description should be 'Migrated: custom-label-1, custom-label-2' (from migration[1])
    expect(deriveDataFromStorage(blockState.blockStorage)).toStrictEqual({
      numbers: [10, 20, 30],
      labels: ['custom-label-1', 'custom-label-2'],
      description: 'Migrated: custom-label-1, custom-label-2',
    });

    await projectWatcher.abort();
  });
});

test('v3: no migration needed when already at target version', async ({ expect }) => {
  await withMl(async (ml, workFolder) => {
    const pRid1 = await ml.createProject({ label: 'No Migration Test' }, 'migration-none');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    const tmpDevBlockFolder = path.resolve(workFolder, 'dev');
    await fs.promises.mkdir(tmpDevBlockFolder, { recursive: true });

    // Add a block
    const block1Id = await prj.addBlock('Block 1', enterNumberSpec);

    // Create project watcher to track blockStorage
    const projectWatcher = await createProjectWatcher<BlockDumpUnified>(ml, prj, {
      workFolder,
      validator: BlockDumpArraySchemaUnified,
    });

    // Set raw storage with v3 state (already at target version)
    const v3State = {
      numbers: [100, 200],
      labels: ['already-migrated'],
      description: 'Already at v3',
    };
    const v3Storage = createRawBlockStorage(v3State, 'v3');
    console.log('[No Migration Test] Setting v3 storage:', v3Storage);
    await prj.setBlockStorageRaw(block1Id, v3Storage);

    // Verify storage was set - log full blockStorage
    const overview1 = await prj.overview.awaitStableValue();
    const storageInfo1 = parseJson<StorageDebugView>(overview1.blocks[0].storageDebugView!);
    expect(storageInfo1.dataVersion).toBe('v3');

    // Log blockStorage after setting v3 state
    const blockDump1 = projectWatcher.getBlockDump(block1Id);
    console.log('[No Migration Test] Step 1 - After setting v3 storage:');
    console.log('  blockStorage:', JSON.stringify(blockDump1?.blockStorage?.data, null, 2));

    // Trigger block pack update
    await triggerBlockPackUpdate(prj);

    const overview2 = await prj.overview.awaitStableValue();
    if (overview2.blocks[0].updatedBlockPack) {
      // Log blockStorage before update
      const blockDump2 = projectWatcher.getBlockDump(block1Id);
      console.log('[No Migration Test] Step 2 - Before update (updatedBlockPack available):');
      console.log('  blockStorage:', JSON.stringify(blockDump2?.blockStorage?.data, null, 2));

      console.log('[No Migration Test] Step 3 - Triggering block pack update...');
      await prj.updateBlockPack(block1Id, overview2.blocks[0].updatedBlockPack);

      // Verify no migration ran - state should be unchanged
      const overview3 = await prj.overview.awaitStableValue();
      const storageInfo3 = parseJson<StorageDebugView>(overview3.blocks[0].storageDebugView!);
      console.log('[No Migration Test] After update, dataVersion:', storageInfo3.dataVersion);
      expect(storageInfo3.dataVersion).toBe('v3');

      // Wait for watcher to sync
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Log blockStorage after update (should be unchanged)
      const blockDump3 = projectWatcher.getBlockDump(block1Id);
      console.log('[No Migration Test] Step 4 - After update (no migration):');
      console.log('  blockStorage:', JSON.stringify(blockDump3?.blockStorage?.data, null, 2));

      // Verify blockStorage structure is unchanged
      const blockStorageData3 = blockDump3?.blockStorage?.data as Record<string, unknown> | undefined;
      expect(blockStorageData3?.[BLOCK_STORAGE_KEY]).toBe('v1');
      expect(blockStorageData3?.__dataVersion).toBe('v3');
      expect(blockStorageData3?.__data).toStrictEqual(v3State);

      // State should be preserved exactly
      const blockState = await prj.getBlockState(block1Id).awaitStableValue();
      expect(deriveDataFromStorage(blockState.blockStorage)).toStrictEqual(v3State);
    }

    await projectWatcher.abort();
  });
});

test('v3: migration failure resets to initial data', async ({ expect }) => {
  // This test verifies that when a migration throws an exception,
  // the data is reset to initialData and dataVersion is set to target version.
  // The enter-numbers-v3 migration[0] throws if numbers contain 666.
  await withMl(async (ml, workFolder) => {
    const pRid1 = await ml.createProject({ label: 'Migration Failure Test' }, 'migration-failure');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    const tmpDevBlockFolder = path.resolve(workFolder, 'dev');
    await fs.promises.mkdir(tmpDevBlockFolder, { recursive: true });

    // Add a block
    const block1Id = await prj.addBlock('Block 1', enterNumberSpec);

    // Create project watcher to track blockStorage
    const projectWatcher = await createProjectWatcher<BlockDumpUnified>(ml, prj, {
      workFolder,
      validator: BlockDumpArraySchemaUnified,
    });

    // Set raw storage with v1 state containing 666 (triggers migration failure)
    const v1StateWithForbiddenNumber = { numbers: [1, 666, 3] };
    const v1Storage = createRawBlockStorage(v1StateWithForbiddenNumber, 'v1');
    console.log('[Migration Failure Test] Setting v1 storage with 666:', v1Storage);
    await prj.setBlockStorageRaw(block1Id, v1Storage);

    // Verify storage was set
    const overview1 = await prj.overview.awaitStableValue();
    const storageInfo1 = parseJson<StorageDebugView>(overview1.blocks[0].storageDebugView!);
    expect(storageInfo1.dataVersion).toBe('v1');

    // Log blockStorage after setting v1 state
    const blockDump1 = projectWatcher.getBlockDump(block1Id);
    console.log('[Migration Failure Test] Step 1 - After setting v1 storage with 666:');
    console.log('  blockStorage:', JSON.stringify(blockDump1?.blockStorage?.data, null, 2));

    // Trigger block pack update
    await triggerBlockPackUpdate(prj);

    const overview2 = await prj.overview.awaitStableValue();
    expect(overview2.blocks[0].updatedBlockPack).toBeDefined();

    // Log blockStorage before migration
    const blockDump2 = projectWatcher.getBlockDump(block1Id);
    console.log('[Migration Failure Test] Step 2 - Before migration (updatedBlockPack available):');
    console.log('  blockStorage:', JSON.stringify(blockDump2?.blockStorage?.data, null, 2));

    // Apply update - migration should fail and reset to initial data
    console.log('[Migration Failure Test] Step 3 - Triggering block pack update (migration will fail)...');
    await prj.updateBlockPack(block1Id, overview2.blocks[0].updatedBlockPack!);

    // Verify dataVersion is now v3 (target version) despite migration failure
    const overview3 = await prj.overview.awaitStableValue();
    const storageInfo3 = parseJson<StorageDebugView>(overview3.blocks[0].storageDebugView!);
    console.log('[Migration Failure Test] After failed migration, dataVersion:', storageInfo3.dataVersion);
    expect(storageInfo3.dataVersion).toBe('v3');

    // Wait for watcher to sync
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Log blockStorage after failed migration
    const blockDump3 = projectWatcher.getBlockDump(block1Id);
    console.log('[Migration Failure Test] Step 4 - After failed migration:');
    console.log('  blockStorage:', JSON.stringify(blockDump3?.blockStorage?.data, null, 2));

    // Verify blockStorage structure after reset
    const blockStorageData3 = blockDump3?.blockStorage?.data as Record<string, unknown> | undefined;
    expect(blockStorageData3?.[BLOCK_STORAGE_KEY]).toBe('v1');
    expect(blockStorageData3?.__dataVersion).toBe('v3');

    // Check the state - should be reset to initialData (empty arrays and empty string)
    const blockState = await prj.getBlockState(block1Id).awaitStableValue();
    console.log('[Migration Failure Test] Reset state:', deriveDataFromStorage(blockState.blockStorage));

    // After migration failure, data should be reset to initialData:
    // - numbers: [] (initial)
    // - labels: [] (initial)
    // - description: '' (initial)
    expect(deriveDataFromStorage(blockState.blockStorage)).toStrictEqual({
      numbers: [],
      labels: [],
      description: '',
    });

    await projectWatcher.abort();
  });
});

test('v3: fresh block with correct version survives block pack update', async ({ expect }) => {
  // This test verifies that:
  // 1. Fresh block is created with dataVersion=3 (target version)
  // 2. User modifies data
  // 3. Block pack update does NOT run migration (already at target version)
  // 4. User's data is preserved
  await withMl(async (ml, workFolder) => {
    const pRid1 = await ml.createProject({ label: 'Fresh Block Update Test' }, 'migration-fresh-update');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    // Add a fresh block - gets dataVersion=v3 and v3-format data
    const block1Id = await prj.addBlock('Block 1', enterNumberSpec);

    // Create project watcher to track blockStorage
    const projectWatcher = await createProjectWatcher<BlockDumpUnified>(ml, prj, {
      workFolder,
      validator: BlockDumpArraySchemaUnified,
    });

    // Verify fresh block state
    const overview1 = await prj.overview.awaitStableValue();
    const storageInfo1 = parseJson<StorageDebugView>(overview1.blocks[0].storageDebugView!);
    console.log('[Fresh Update Test] Fresh block dataVersion:', storageInfo1.dataVersion);

    // Fresh block should have dataVersion = v3 (latest version key)
    expect(storageInfo1.dataVersion).toBe('v3');

    // Get the actual data - it's already in v3 format!
    const blockState1 = await prj.getBlockState(block1Id).awaitStableValue();
    console.log('[Fresh Update Test] Fresh block data:', deriveDataFromStorage(blockState1.blockStorage));
    expect(deriveDataFromStorage(blockState1.blockStorage)).toStrictEqual({
      numbers: [],
      labels: [],
      description: '',
    });

    // Set some data - this will preserve version 1
    await prj.mutateBlockStorage(block1Id, {
      operation: 'update-data',
      value: {
        numbers: [1, 2, 3],
        labels: ['my-label'],
        description: 'My description',
      },
    });

    // Log the state after setting data
    const blockDump1 = projectWatcher.getBlockDump(block1Id);
    console.log('[Fresh Update Test] After setData:');
    console.log('  blockStorage:', JSON.stringify(blockDump1?.blockStorage?.data, null, 2));

    // Trigger block pack update - this will trigger migration!
    await triggerBlockPackUpdate(prj);

    const overview2 = await prj.overview.awaitStableValue();
    expect(overview2.blocks[0].updatedBlockPack).toBeDefined();

    // Apply update - migration will run v1→v2→v3 on data that's ALREADY v3!
    console.log('[Fresh Update Test] Triggering block pack update...');
    await prj.updateBlockPack(block1Id, overview2.blocks[0].updatedBlockPack!);

    // Check what happened
    const overview3 = await prj.overview.awaitStableValue();
    const storageInfo3 = parseJson<StorageDebugView>(overview3.blocks[0].storageDebugView!);
    console.log('[Fresh Update Test] After update, dataVersion:', storageInfo3.dataVersion);

    // Wait for watcher to sync
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Log the corrupted storage
    const blockDump3 = projectWatcher.getBlockDump(block1Id);
    console.log('[Fresh Update Test] After update (data preserved):');
    console.log('  blockStorage:', JSON.stringify(blockDump3?.blockStorage?.data, null, 2));

    // Check the corrupted state
    const blockState3 = await prj.getBlockState(block1Id).awaitStableValue();
    console.log('[Fresh Update Test] Preserved state:', deriveDataFromStorage(blockState3.blockStorage));

    // With correct dataVersion=3, migration should NOT run
    // Data should be preserved exactly as the user set it
    expect(deriveDataFromStorage(blockState3.blockStorage)).toStrictEqual({
      numbers: [1, 2, 3],
      labels: ['my-label'], // Should be preserved, NOT overwritten
      description: 'My description', // Should be preserved, NOT overwritten
    });

    await projectWatcher.abort();
  });
});

test('v3: unknown version edge case - resets to initial data', async ({ expect }) => {
  // This test verifies behavior when block has an unknown version key.
  // The migration should reset to initial data with the target version.
  await withMl(async (ml, workFolder) => {
    const pRid1 = await ml.createProject({ label: 'Migration Edge Case Test' }, 'migration-edge');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    // Add a block
    const block1Id = await prj.addBlock('Block 1', enterNumberSpec);

    // Create project watcher to track blockStorage
    const projectWatcher = await createProjectWatcher<BlockDumpUnified>(ml, prj, {
      workFolder,
      validator: BlockDumpArraySchemaUnified,
    });

    // Set raw block storage with version 0 (simulating very old/corrupted state)
    const veryOldState = { numbers: [5, 4, 3] };
    const veryOldStorage = createRawBlockStorage(veryOldState, 'v0');
    console.log('[Edge Case Test] Setting version 0 storage:', veryOldStorage);
    await prj.setBlockStorageRaw(block1Id, veryOldStorage);

    // Verify storage was set - log full blockStorage
    const overview1 = await prj.overview.awaitStableValue();
    const storageInfo1 = parseJson<StorageDebugView>(overview1.blocks[0].storageDebugView!);
    expect(storageInfo1.dataVersion).toBe('v0');

    // Log blockStorage after setting version 0 state
    const blockDump1 = projectWatcher.getBlockDump(block1Id);
    console.log('[Edge Case Test] Step 1 - After setting version 0 storage:');
    console.log('  blockStorage:', JSON.stringify(blockDump1?.blockStorage?.data, null, 2));

    // Trigger block pack update
    await triggerBlockPackUpdate(prj);

    const overview2 = await prj.overview.awaitStableValue();
    if (overview2.blocks[0].updatedBlockPack) {
      // Log blockStorage before update
      const blockDump2 = projectWatcher.getBlockDump(block1Id);
      console.log('[Edge Case Test] Step 2 - Before update (updatedBlockPack available):');
      console.log('  blockStorage:', JSON.stringify(blockDump2?.blockStorage?.data, null, 2));

      console.log('[Edge Case Test] Step 3 - Triggering block pack update...');
      await prj.updateBlockPack(block1Id, overview2.blocks[0].updatedBlockPack);

      const overview3 = await prj.overview.awaitStableValue();
      const storageInfo3 = parseJson<StorageDebugView>(overview3.blocks[0].storageDebugView!);
      console.log('[Edge Case Test] After migration reset, dataVersion:', storageInfo3.dataVersion);

      // Wait for watcher to sync
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Log blockStorage after migration reset
      const blockDump3 = projectWatcher.getBlockDump(block1Id);
      console.log('[Edge Case Test] Step 4 - After migration reset:');
      console.log('  blockStorage:', JSON.stringify(blockDump3?.blockStorage?.data, null, 2));

      // State version should now be v3 (target version) because data was reset to initial
      expect(storageInfo3.dataVersion).toBe('v3');

      // Verify blockStorage structure after reset
      const blockStorageData3 = blockDump3?.blockStorage?.data as Record<string, unknown> | undefined;
      expect(blockStorageData3?.[BLOCK_STORAGE_KEY]).toBe('v1');
      expect(blockStorageData3?.__dataVersion).toBe('v3');

      // Data should be reset to initialData (empty arrays and empty string)
      const blockState = await prj.getBlockState(block1Id).awaitStableValue();
      console.log('[Edge Case Test] Reset state:', deriveDataFromStorage(blockState.blockStorage));
      expect(deriveDataFromStorage(blockState.blockStorage)).toStrictEqual({
        numbers: [],
        labels: [],
        description: '',
      });

      // Block pack update should still succeed even though migration reset to initial
      expect(overview3.blocks[0].currentBlockPack).toStrictEqual(
        overview2.blocks[0].updatedBlockPack,
      );
    }

    await projectWatcher.abort();
  });
});
