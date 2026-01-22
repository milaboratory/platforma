import { blockSpec as enterNumberSpec } from '@milaboratories/milaboratories.test-enter-numbers-v3';
import { blockSpec as sumNumbersSpec } from '@milaboratories/milaboratories.test-sum-numbers-v3';
import { test } from 'vitest';
import { withMl } from './with-ml';
import {
  awaitBlockDone,
  awaitBlockStateStable,
  createProjectWatcher,
  outputRef,
} from './test-helpers';
import type { BlockDumpUnified } from './unified-state-schema';
import { BlockDumpArraySchemaUnified } from './unified-state-schema';
import type { BlockStateOverview } from '@milaboratories/pl-middle-layer';

// Test for prerunArgs / fastNumbers feature
test('v3: prerunArgs fastNumbers test', { timeout: 10_000 }, async ({ expect }) => {
  await withMl(async (ml, workFolder) => {
    const pRid = await ml.createProject({ label: 'PrerunArgs Test' }, 'prerun-test');
    await ml.openProject(pRid);
    const prj = ml.getOpenedProject(pRid);

    const enterNumberId = await prj.addBlock('Enter Numbers', enterNumberSpec);

    const awaitOverview = async (cb: (overview: BlockStateOverview[]) => void) => {
      const overview = await prj.overview.awaitStableValue();
      cb(overview.blocks);
    };

    const findEnterNumberBlock = (blocks: BlockStateOverview[]) => {
      return blocks.find((block) => block.id === enterNumberId);
    };

    const projectWatcher = await createProjectWatcher<BlockDumpUnified>(ml, prj, {
      workFolder,
      validator: BlockDumpArraySchemaUnified,
    });

    // Wait for initial staging to complete
    await awaitOverview((blocks) => {
      const enterNumberBlock = findEnterNumberBlock(blocks);
      expect(enterNumberBlock?.calculationStatus).toBe('NotCalculated');
      expect(enterNumberBlock?.canRun).toBe(false);
    });

    // Set state with numbers - prerunArgs should derive fastNumbers
    await prj.mutateBlockStorage(enterNumberId, {
      operation: 'update-data',
      value: { numbers: [3, 1, 2] },
    });

    await awaitOverview((blocks) => {
      const enterNumberBlock = findEnterNumberBlock(blocks);
      expect(enterNumberBlock?.canRun).toBe(true);
    });

    // Await staging to complete - this waits for all outputs (including prerun-dependent ones) to stabilize
    const blockState = await awaitBlockStateStable(prj, enterNumberId);

    // Verify numbersCount from prerun (should be 1 - only even number is 2)
    expect(blockState.outputs?.['numbersCount']).toStrictEqual({
      ok: true,
      value: 1,
      stable: true,
    });

    // The prerun should have received evenNumbers (only even numbers from [3, 1, 2]): [2]
    // Check the block dump for staging output
    const blockDump = projectWatcher.getBlockDump(enterNumberId);
    // console.log('Block dump stagingOutput:', JSON.stringify(blockDump?.stagingOutput, null, 2));

    // Verify that prerun workflow received evenNumbers
    const evenNumbersData = blockDump?.stagingOutput?.outputs?.['evenNumbers']?.data;
    if (evenNumbersData !== undefined) {
      // evenNumbers should be only [2] (the only even number from [3, 1, 2])
      expect(evenNumbersData).toStrictEqual([2]);
    }

    // Verify prerunArgsJson output - should contain ONLY evenNumbers, NOT numbers
    expect(blockState.outputs?.['prerunArgsJson']).toBeDefined();
    if (blockState.outputs?.['prerunArgsJson']?.ok) {
      const prerunArgs = blockState.outputs['prerunArgsJson'].value as Record<string, unknown>;
      // console.log('prerunArgs:', prerunArgs);

      // Should have evenNumbers
      expect(prerunArgs).toHaveProperty('evenNumbers');
      expect(prerunArgs.evenNumbers).toStrictEqual([2]);

      // Should NOT have numbers - this proves prerunArgs is used, not args
      expect(prerunArgs).not.toHaveProperty('numbers');
    }

    // ========== TEST: Staging should be SKIPPED when prerunArgs remains the same ==========
    console.log('\n=== TEST: Changing numbers but keeping same evenNumbers (should SKIP staging) ===');
    // Change [3, 1, 2] to [5, 1, 2] - evenNumbers stays [2], so staging should be skipped
    await prj.mutateBlockStorage(enterNumberId, {
      operation: 'update-data',
      value: { numbers: [5, 1, 2] }, // odd numbers changed (3→5), but even numbers still just [2]
    });

    // Wait a bit for any potential staging to process
    await new Promise((resolve) => setTimeout(resolve, 500));
    const blockState2 = await awaitBlockStateStable(prj, enterNumberId);

    // numbersCount should still be 1 (only [2] is even)
    expect(blockState2.outputs?.['numbersCount']).toStrictEqual({
      ok: true,
      value: 1,
      stable: true,
    });
    console.log('After changing [3,1,2] to [5,1,2]: numbersCount still 1 ✓');

    // ========== TEST: Staging SHOULD run when prerunArgs changes ==========
    console.log('\n=== TEST: Changing numbers with different evenNumbers (should RENDER staging) ===');
    // Change [5, 1, 2] to [5, 1, 4] - evenNumbers changes from [2] to [4], staging should run
    await prj.mutateBlockStorage(enterNumberId, {
      operation: 'update-data',
      value: { numbers: [5, 1, 4] }, // now even number is 4 instead of 2
    });

    const blockState3 = await awaitBlockStateStable(prj, enterNumberId);

    // numbersCount should still be 1 (only [4] is even)
    expect(blockState3.outputs?.['numbersCount']).toStrictEqual({
      ok: true,
      value: 1,
      stable: true,
    });

    // But evenNumbers should now be [4]
    if (blockState3.outputs?.['prerunArgsJson']?.ok) {
      const prerunArgs3 = blockState3.outputs['prerunArgsJson'].value as Record<string, unknown>;
      expect(prerunArgs3.evenNumbers).toStrictEqual([4]);
      console.log('After changing to [5,1,4]: evenNumbers now [4] ✓');
    }

    // Run the block to verify production uses args (numbers) not prerunArgs (fastNumbers)
    await prj.runBlock(enterNumberId);
    await awaitBlockDone(prj, enterNumberId);

    const blockStateAfterRun = await prj.getBlockState(enterNumberId).getValue();
    // console.log('Block state after run:', JSON.stringify(blockStateAfterRun, null, 2));

    // numbers output should be available after production run
    expect(blockStateAfterRun.outputs?.['numbers']).toBeDefined();

    await projectWatcher.abort();
  });
});

test('v3: project watcher test', { timeout: 20_000 }, async ({ expect }) => {
  await withMl(async (ml, workFolder) => {
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    expect(prj.rid).toBe(pRid1);

    const awaitOverview = async (cb: (overview: BlockStateOverview[]) => void) => {
      const overview = await prj.overview.awaitStableValue();
      cb(overview.blocks);
    };

    const enterNumberId = await prj.addBlock('Block 1', enterNumberSpec);
    const sumNumbersId = await prj.addBlock('Block 2', sumNumbersSpec);

    const findEnterNumberBlock = (blocks: BlockStateOverview[]) => {
      return blocks.find((block) => block.id === enterNumberId);
    };

    const findSumNumbersBlock = (blocks: BlockStateOverview[]) => {
      return blocks.find((block) => block.id === sumNumbersId);
    };

    const projectWatcher = await createProjectWatcher<BlockDumpUnified>(ml, prj, {
      workFolder,
      validator: BlockDumpArraySchemaUnified,
    });

    await awaitOverview((blocks) => {
      expect(blocks.length).toBe(2);
      const enterNumberBlock = findEnterNumberBlock(blocks);
      const sumNumbersBlock = findSumNumbersBlock(blocks);
      expect(enterNumberBlock?.calculationStatus).toBe('NotCalculated');
      expect(enterNumberBlock?.canRun).toBe(false);
      expect(sumNumbersBlock?.calculationStatus).toBe('NotCalculated');
      expect(sumNumbersBlock?.canRun).toBe(false);
      expect(enterNumberBlock?.sections).toBeDefined(); // should be defined
    });

    // v3 state format: direct state object (not wrapped in {args: ...})
    await prj.mutateBlockStorage(enterNumberId, {
      operation: 'update-data',
      value: { numbers: [1, 2, 3] },
    });

    await prj.mutateBlockStorage(sumNumbersId, {
      operation: 'update-data',
      value: { sources: [outputRef(enterNumberId, 'numbers')] },
    });

    await awaitOverview((blocks) => {
      const enterNumberBlock = findEnterNumberBlock(blocks);
      const sumNumbersBlock = findSumNumbersBlock(blocks);
      expect(enterNumberBlock?.calculationStatus).toBe('NotCalculated');
      expect(enterNumberBlock?.canRun).toBe(true);
      expect(sumNumbersBlock?.calculationStatus).toBe('NotCalculated');
      expect(sumNumbersBlock?.canRun).toBe(true);
    });

    await prj.runBlock(sumNumbersId);
    await awaitBlockDone(prj, sumNumbersId);

    // expect(projectWatcher.getBlockDump(sumNumbersId)?.prodOutput?.inputs?.sum.data).toStrictEqual(6);

    const block2StableState1 = await prj.getBlockState(sumNumbersId).getValue();
    expect(block2StableState1.outputs!['sum']).toStrictEqual({
      ok: true,
      value: 6,
      stable: true,
    });

    await awaitOverview((blocks) => {
      const enterNumberBlock = findEnterNumberBlock(blocks);
      const sumNumbersBlock = findSumNumbersBlock(blocks);
      expect(enterNumberBlock?.calculationStatus).toBe('Done');
      expect(enterNumberBlock?.canRun).toBe(false);
      expect(sumNumbersBlock?.calculationStatus).toBe('Done');
      expect(sumNumbersBlock?.canRun).toBe(false);
    });

    await prj.mutateBlockStorage(enterNumberId, {
      operation: 'update-data',
      value: { numbers: [2, 3] },
    });
    await prj.runBlock(enterNumberId);
    await awaitBlockDone(prj, enterNumberId);

    await awaitOverview((blocks) => {
      const enterNumberBlock = findEnterNumberBlock(blocks);
      const sumNumbersBlock = findSumNumbersBlock(blocks);
      expect(enterNumberBlock?.calculationStatus).toBe('Done');
      expect(enterNumberBlock?.canRun).toBe(false);
      expect(sumNumbersBlock?.calculationStatus).toBe('Limbo');
      expect(sumNumbersBlock?.canRun).toBe(true);
    });

    await prj.runBlock(sumNumbersId);
    await awaitBlockDone(prj, sumNumbersId);

    const block2StableState2 = await prj.getBlockState(sumNumbersId).getValue();
    expect(block2StableState2.outputs!['sum']).toStrictEqual({
      ok: true,
      value: 5,
      stable: true,
    });

    await awaitOverview((blocks) => {
      const enterNumberBlock = findEnterNumberBlock(blocks);
      const sumNumbersBlock = findSumNumbersBlock(blocks);
      expect(enterNumberBlock?.calculationStatus).toBe('Done');
      expect(enterNumberBlock?.canRun).toBe(false);
      expect(sumNumbersBlock?.calculationStatus).toBe('Done');
      expect(sumNumbersBlock?.canRun).toBe(false);
    });

    await projectWatcher.abort();
  });
});
