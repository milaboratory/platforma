import { field, poll, TestHelpers, toGlobalResourceId } from '@milaboratories/pl-client';
import { getQuickJS } from 'quickjs-emscripten';
import { expect, test } from 'vitest';
import { outputRef } from '../model/args';
import { ProjectHelper } from '../model/project_helper';
import {
  BlockRenderingStateKey,
  projectFieldName,
  ProjectRenderingState
} from '../model/project_model';
import {
  TestBPPreparer
} from '../test/block_packs';
import { createProject, ProjectMutator } from './project';
import type { BlockPackSpec } from '@milaboratories/pl-model-middle-layer';
import path from 'node:path';

// V3 block specs - using dev-v2 type with local folders
// These blocks use the new unified state format (state instead of args+uiState)
const BPSpecEnterV3: BlockPackSpec = {
  type: 'dev-v2',
  // Navigate from lib/node/pl-middle-layer/src/mutator to etc/blocks/enter-numbers-v3/block
  folder: path.resolve(__dirname, '../../../../../etc/blocks/enter-numbers-v3/block'),
};

const BPSpecSumV3: BlockPackSpec = {
  type: 'dev-v2',
  folder: path.resolve(__dirname, '../../../../../etc/blocks/sum-numbers-v3/block'),
};

test('v3 blocks: basic test with unified state', async () => {
  const quickJs = await getQuickJS();

  await TestHelpers.withTempRoot(async (pl) => {
    const prj = await pl.withWriteTx('CreatingProject', async (tx) => {
      const prjRef = await createProject(tx);
      tx.createField(field(tx.clientRoot, 'prj'), 'Dynamic', prjRef);
      await tx.commit();
      return await toGlobalResourceId(prjRef);
    });

    // Add enter-numbers-v3 block with storageMode: 'fromModel'
    // Initial storage comes from VM, then we set desired state via setStates
    await pl.withWriteTx('AddEnterNumbersV3Block', async (tx) => {
      const mut = await ProjectMutator.load(new ProjectHelper(quickJs), tx, prj);
      mut.addBlock(
        { id: 'enter1', label: 'Enter Numbers V3', renderingMode: 'Heavy' },
        {
          storageMode: 'fromModel',
          blockPack: await TestBPPreparer.prepare(BPSpecEnterV3)
        }
      );
      // Set initial test data
      mut.setStates([{ blockId: 'enter1', state: { numbers: [1, 2, 3] } }]);
      mut.save();
      await tx.commit();
    });

    // Verify blockStorage was saved
    await poll(pl, async (tx) => {
      const prjR = await tx.get(prj);
      const blockStorage = await prjR.get(projectFieldName('enter1', 'blockStorage'));
      const stateData = Buffer.from(blockStorage.data.data!).toString();
      expect(JSON.parse(stateData).__data).toStrictEqual({ numbers: [1, 2, 3] });
    });

    // Add second enter-numbers-v3 block
    await pl.withWriteTx('AddEnterNumbersV3Block2', async (tx) => {
      const mut = await ProjectMutator.load(new ProjectHelper(quickJs), tx, prj);
      mut.addBlock(
        { id: 'enter2', label: 'Enter Numbers V3 #2', renderingMode: 'Heavy' },
        {
          storageMode: 'fromModel',
          blockPack: await TestBPPreparer.prepare(BPSpecEnterV3)
        }
      );
      mut.setStates([{ blockId: 'enter2', state: { numbers: [4, 5, 6] } }]);
      mut.doRefresh();
      mut.save();
      await tx.commit();
    });

    // Add sum-numbers-v3 block that references both enter blocks
    await pl.withWriteTx('AddSumNumbersV3Block', async (tx) => {
      const mut = await ProjectMutator.load(new ProjectHelper(quickJs), tx, prj);
      mut.addBlock(
        { id: 'sum1', label: 'Sum Numbers V3', renderingMode: 'Heavy' },
        {
          storageMode: 'fromModel',
          blockPack: await TestBPPreparer.prepare(BPSpecSumV3)
        }
      );
      // Set sources to reference upstream blocks
      mut.setStates([{
        blockId: 'sum1',
        state: { sources: [outputRef('enter1', 'numbers'), outputRef('enter2', 'numbers')] }
      }]);
      mut.doRefresh();
      mut.save();
      await tx.commit();
    });

    // Wait for staging outputs
    await poll(pl, async (tx) => {
      const prjR = await tx.get(prj);
      const stagingOutput = await prjR
        .get(projectFieldName('enter1', 'stagingOutput'))
        .then((r) => r.final());
      const all = await stagingOutput.getAllFinal();
      // V3 enter-numbers-v3 block has prerun with numbersCount output
      expect(Object.keys(all)).toContain('numbersCount');
    });

    // Render production for all blocks
    await pl.withWriteTx('RenderProduction', async (tx) => {
      const mut = await ProjectMutator.load(new ProjectHelper(quickJs), tx, prj);
      mut.renderProduction(['enter1', 'enter2', 'sum1']);
      mut.doRefresh();
      mut.save();
      await tx.commit();
    });

    // Verify production outputs
    await poll(pl, async (tx) => {
      const prjR = await tx.get(prj);
      const prodOutput = await prjR
        .get(projectFieldName('sum1', 'prodOutput'))
        .then((r) => r.final());
      const all = await prodOutput.getAllFinal();
      expect(Object.keys(all)).toContain('sum');

      const sumValue = await prodOutput.get('sum');
      const sum = JSON.parse(Buffer.from(sumValue.data.data!).toString());
      // [1,2,3] + [4,5,6] = 21
      expect(sum).toBe(21);
    });
  });
});

test('v3 blocks: preRunArgs skip test', async () => {
  const quickJs = await getQuickJS();

  await TestHelpers.withTempRoot(async (pl) => {
    const prj = await pl.withWriteTx('CreatingProject', async (tx) => {
      const prjRef = await createProject(tx);
      tx.createField(field(tx.clientRoot, 'prj'), 'Dynamic', prjRef);
      await tx.commit();
      return await toGlobalResourceId(prjRef);
    });

    // Add enter-numbers-v3 block
    await pl.withWriteTx('AddEnterNumbersV3Block', async (tx) => {
      const mut = await ProjectMutator.load(new ProjectHelper(quickJs), tx, prj);
      mut.addBlock(
        { id: 'enter1', label: 'Enter Numbers V3', renderingMode: 'Heavy' },
        {
          storageMode: 'fromModel',
          blockPack: await TestBPPreparer.prepare(BPSpecEnterV3)
        }
      );
      // Set initial state: [3, 1, 2] - has one even number (2)
      mut.setStates([{ blockId: 'enter1', state: { numbers: [3, 1, 2] } }]);
      mut.doRefresh();
      mut.save();
      await tx.commit();
    });

    // Wait for initial staging
    await poll(pl, async (tx) => {
      const prjR = await tx.get(prj);
      const stagingOutput = await prjR
        .get(projectFieldName('enter1', 'stagingOutput'))
        .then((r) => r.final());
      const all = await stagingOutput.getAllFinal();
      expect(Object.keys(all)).toContain('numbersCount');
      // Should count even numbers: [2] -> count = 1
      const countValue = await stagingOutput.get('numbersCount');
      const count = JSON.parse(Buffer.from(countValue.data.data!).toString());
      expect(count).toBe(1);
    });

    // Change state: [3, 1, 2] -> [5, 1, 2]
    // preRunArgs (evenNumbers) stays [2], so staging should be SKIPPED
    await pl.withWriteTx('ChangeState_SamePreRunArgs', async (tx) => {
      const mut = await ProjectMutator.load(new ProjectHelper(quickJs), tx, prj);
      mut.setStates([{
        blockId: 'enter1',
        state: { numbers: [5, 1, 2] }  // Changed odd numbers only
      }]);
      mut.doRefresh();
      mut.save();
      await tx.commit();
    });

    // Staging should still have numbersCount = 1
    await poll(pl, async (tx) => {
      const prjR = await tx.get(prj);
      const stagingOutput = await prjR
        .get(projectFieldName('enter1', 'stagingOutput'))
        .then((r) => r.final());
      const countValue = await stagingOutput.get('numbersCount');
      const count = JSON.parse(Buffer.from(countValue.data.data!).toString());
      expect(count).toBe(1);  // Still 1 (only [2] is even)
    });

    // Change state: [5, 1, 2] -> [5, 1, 4]
    // preRunArgs (evenNumbers) changes from [2] to [4], so staging should RUN
    await pl.withWriteTx('ChangeState_DifferentPreRunArgs', async (tx) => {
      const mut = await ProjectMutator.load(new ProjectHelper(quickJs), tx, prj);
      mut.setStates([{
        blockId: 'enter1',
        state: { numbers: [5, 1, 4] }  // Changed even number from 2 to 4
      }]);
      mut.doRefresh();
      mut.save();
      await tx.commit();
    });

    // Wait for new staging
    await poll(pl, async (tx) => {
      const prjR = await tx.get(prj);
      const stagingOutput = await prjR
        .get(projectFieldName('enter1', 'stagingOutput'))
        .then((r) => r.final());
      const countValue = await stagingOutput.get('numbersCount');
      const count = JSON.parse(Buffer.from(countValue.data.data!).toString());
      expect(count).toBe(1);  // Still 1 (only [4] is even)
    });

    // Verify preRunArgsJson output contains evenNumbers, not numbers
    await poll(pl, async (tx) => {
      const prjR = await tx.get(prj);
      const stagingOutput = await prjR
        .get(projectFieldName('enter1', 'stagingOutput'))
        .then((r) => r.final());

      const preRunArgsValue = await stagingOutput.get('preRunArgsJson');
      const preRunArgs = JSON.parse(Buffer.from(preRunArgsValue.data.data!).toString());

      // Should have evenNumbers, NOT numbers
      expect(preRunArgs).toHaveProperty('evenNumbers');
      expect(preRunArgs.evenNumbers).toStrictEqual([4]);
      expect(preRunArgs).not.toHaveProperty('numbers');
    });
  });
});

