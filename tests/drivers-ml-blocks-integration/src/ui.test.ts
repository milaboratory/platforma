import { blockSpec as uiExamplesSpec } from '@milaboratories/milaboratories.ui-examples';
import { test } from 'vitest';
import { withMl } from './with-ml';
import {
  createProjectWatcher,
} from './test-helpers';
import type { BlockDumpUnified } from './unified-state-schema';
import { BlockDumpArraySchemaUnified } from './unified-state-schema';
import type { BlockStateOverview } from '@milaboratories/pl-middle-layer';

// V3 ui api
test('v3: ui test', { timeout: 10_000 }, async ({ expect }) => {
  await withMl(async (ml, workFolder) => {
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    expect(prj.rid).toBe(pRid1);

    const awaitOverview = async (cb: (overview: BlockStateOverview[]) => void) => {
      const overview = await prj.overview.awaitStableValue();
      cb(overview.blocks);
    };

    const uiExamplesId = await prj.addBlock('Block 1', uiExamplesSpec);

    const findUiExamplesBlock = (blocks: BlockStateOverview[]) => {
      return blocks.find((block) => block.id === uiExamplesId);
    };

    const projectWatcher = await createProjectWatcher<BlockDumpUnified>(ml, prj, {
      workFolder,
      validator: BlockDumpArraySchemaUnified,
    });

    await awaitOverview((blocks) => {
      expect(blocks.length).toBe(1);
      const uiExamplesBlock = findUiExamplesBlock(blocks);
      expect(uiExamplesBlock?.calculationStatus).toBe('NotCalculated');
      expect(uiExamplesBlock?.canRun).toBe(true); // v1 block with valid initial args can run
      expect(uiExamplesBlock?.sections).toBeDefined();
    });

    await projectWatcher.abort();
  });
});
