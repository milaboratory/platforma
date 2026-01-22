import { blockSpec as enterNumberSpec } from '@milaboratories/milaboratories.test-enter-numbers';
import { blockSpec as sumNumbersSpec } from '@milaboratories/milaboratories.test-sum-numbers';
import { test } from 'vitest';
import { withMl } from './with-ml';
import {
  awaitBlockDone,
  createProjectWatcher,
  outputRef,
} from './test-helpers';

import { BlockDumpArraySchemaUnified } from './unified-state-schema';

// v2/v1 ui api test
test('v2: temp test', { timeout: 10_000 }, async ({ expect }) => {
  await withMl(async (ml, workFolder) => {
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    expect(prj.rid).toBe(pRid1);

    const enterNumberId = await prj.addBlock('Block 1', enterNumberSpec);
    const sumNumbersId = await prj.addBlock('Block 2', sumNumbersSpec);

    const projectWatcher = await createProjectWatcher(ml, prj, {
      workFolder,
      validator: BlockDumpArraySchemaUnified,
    });

    console.log('>>>> projectWatcher dump', projectWatcher.dump);

    const overview0 = await prj.overview.awaitStableValue();
    overview0.blocks.forEach((block) => {
      expect(block.sections).toBeDefined();
      expect(block.canRun).toEqual(false); // should be false because numbers length is 0
      expect(block.currentBlockPack).toBeDefined();
    });

    console.log('>>>> before setBlockArgs');

    await prj.setBlockArgs(enterNumberId, { numbers: [1, 2, 3] });
    await prj.setBlockArgs(sumNumbersId, { sources: [outputRef(enterNumberId, 'numbers')] });

    const overview1 = await prj.overview.awaitStableValue();

    overview1.blocks.forEach((block) => {
      expect(block.sections).toBeDefined();
      expect(block.canRun).toEqual(true);
      expect(block.currentBlockPack).toBeDefined();
    });

    await projectWatcher.abort();
  });
});

test('v2: project watcher test', { timeout: 10_000 }, async ({ expect }) => {
  await withMl(async (ml, workFolder) => {
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    expect(prj.rid).toBe(pRid1);

    const enterNumberId = await prj.addBlock('Block 1', enterNumberSpec);
    const sumNumbersId = await prj.addBlock('Block 2', sumNumbersSpec);

    const projectWatcher = await createProjectWatcher(ml, prj, {
      workFolder,
      validator: BlockDumpArraySchemaUnified,
    });

    console.log('>>>> projectWatcher dump', projectWatcher.dump);

    const overview0 = await prj.overview.awaitStableValue();
    overview0.blocks.forEach((block) => {
      expect(block.sections).toBeDefined();
      expect(block.canRun).toEqual(false);
      expect(block.currentBlockPack).toBeDefined();
    });

    console.log('>>>> before setBlockArgs');

    await prj.setBlockArgs(enterNumberId, { numbers: [1, 2, 3] });
    await prj.setBlockArgs(sumNumbersId, { sources: [outputRef(enterNumberId, 'numbers')] });

    const overview1 = await prj.overview.awaitStableValue();

    overview1.blocks.forEach((block) => {
      expect(block.sections).toBeDefined();
      expect(block.canRun).toEqual(true);
      expect(block.currentBlockPack).toBeDefined();
    });

    await prj.runBlock(sumNumbersId);
    await awaitBlockDone(prj, sumNumbersId);

    const block2StableState1 = await prj.getBlockState(sumNumbersId).getValue();
    expect(block2StableState1.outputs!['sum']).toStrictEqual({
      ok: true,
      value: 6,
      stable: true,
    });

    const overview2 = await prj.overview.awaitStableValue();
    overview2.blocks.forEach((block) => {
      expect(block.sections).toBeDefined();
      expect(block.calculationStatus).toEqual('Done');
      expect(block.canRun).toEqual(false);
      expect(block.currentBlockPack).toBeDefined();
    });

    await prj.setBlockArgs(enterNumberId, { numbers: [2, 3] });
    await prj.runBlock(enterNumberId);
    await awaitBlockDone(prj, enterNumberId);

    const overview3 = await prj.overview.awaitStableValue();
    const [overview3Block1, overview3Block2] = overview3.blocks;
    expect(overview3Block1.calculationStatus).toEqual('Done');
    expect(overview3Block2.calculationStatus).toEqual('Limbo');

    await prj.runBlock(sumNumbersId);
    await awaitBlockDone(prj, sumNumbersId);
    console.log('block done 2');

    const block2StableState2 = await prj.getBlockState(sumNumbersId).getValue();
    expect(block2StableState2.outputs!['sum']).toStrictEqual({
      ok: true,
      value: 5,
      stable: true,
    });

    const overview4 = await prj.overview.awaitStableValue();
    const [overview4Block1, overview4Block2] = overview4.blocks;
    expect(overview4Block1.calculationStatus).toEqual('Done');
    expect(overview4Block2.calculationStatus).toEqual('Done');
    await projectWatcher.abort();
  });
});
