import { TestHelpers } from '@milaboratory/pl-client-v2';
import { MiddleLayer } from './middle_layer';
import { BlockPackSpecAny } from '../model/block_pack_spec';
import { outputRef } from '../model/args';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

const EnterNumbersSpec = {
  type: 'from-registry-v1',
  url: 'https://block.registry.platforma.bio/releases/v1/milaboratory/enter-numbers/0.4.0'
} as BlockPackSpecAny;

const SumNumbersSpec = {
  type: 'from-registry-v1',
  url: 'https://block.registry.platforma.bio/releases/v1/milaboratory/sum-numbers/0.4.0'
} as BlockPackSpecAny;

test('project list manipulations test', async () => {
  const workFolder = path.resolve(`work/${randomUUID()}`);
  await fs.promises.mkdir(workFolder, { recursive: true });
  await TestHelpers.withTempRoot(async pl => {
    const ml = await MiddleLayer.init(pl, {
      frontendDownloadPath: path.resolve(workFolder),
      localSecret: 'secret'
    });
    const projectList = ml.projectList;

    expect(await projectList.awaitStableValue()).toEqual([]);

    const pRid1 = await ml.createProject('id1', { name: 'Project 1' });

    await projectList.refreshState();

    expect(await projectList.getValue()).toStrictEqual([{ id: 'id1', rid: pRid1, meta: { name: 'Project 1' } }]);

    await ml.deleteProject('id1');

    await projectList.refreshState();

    expect(await projectList.awaitStableValue()).toEqual([]);
  });
});

test('simple project manipulations test', async () => {
  const workFolder = path.resolve(`work/${randomUUID()}`);
  await fs.promises.mkdir(workFolder, { recursive: true });
  await TestHelpers.withTempRoot(async pl => {
    const ml = await MiddleLayer.init(pl, {
      frontendDownloadPath: path.resolve(workFolder),
      localSecret: 'secret'
    });
    const projectList = ml.projectList;
    expect(await projectList.awaitStableValue()).toEqual([]);
    const pRid1 = await ml.createProject('id1', { name: 'Project 1' });
    await projectList.refreshState();
    expect(await projectList.getValue()).toStrictEqual([{ id: 'id1', rid: pRid1, meta: { name: 'Project 1' } }]);
    await ml.openProject(pRid1);
    const prj = ml.getProject(pRid1);

    expect(await prj.overview.awaitStableValue()).toEqual({ meta: { name: 'Project 1' }, blocks: [] });

    const block1Id = await prj.addBlock('Block 1', EnterNumbersSpec);
    const block2Id = await prj.addBlock('Block 2', EnterNumbersSpec);
    const block3Id = await prj.addBlock('Block 3', SumNumbersSpec);
    await prj.setBlockArgs(block1Id, { numbers: [1, 2, 3] });
    await prj.setBlockArgs(block2Id, { numbers: [3, 4, 5] });
    await prj.setBlockArgs(block3Id, {
      sources: [
        outputRef(block1Id, 'column'),
        outputRef(block2Id, 'column')
      ]
    });
    await prj.runBlock(block3Id);

    await prj.overview.refreshState();
    const overviewSnapshot1 = await prj.overview.awaitStableValue();

    overviewSnapshot1.blocks.forEach(block => {
      expect(block.sections).toBeDefined();
    });
    console.dir(overviewSnapshot1, { depth: 5 });

    const block1StableFrontend = await prj.getBlockFrontend(block1Id).awaitStableValue();
    expect(block1StableFrontend).toBeDefined();
    const block2StableFrontend = await prj.getBlockFrontend(block2Id).awaitStableValue();
    expect(block2StableFrontend).toBeDefined();
    const block3StableFrontend = await prj.getBlockFrontend(block3Id).awaitStableValue();
    expect(block3StableFrontend).toBeDefined();
    console.dir(
      { block1StableFrontend, block2StableFrontend, block3StableFrontend },
      { depth: 5 });

    const block1StableState = await prj.getBlockState(block1Id).awaitStableValue();
    const block2StableState = await prj.getBlockState(block2Id).awaitStableValue();
    const block3StableState = await prj.getBlockState(block3Id).awaitStableValue();

    console.dir(block1StableState, { depth: 5 });
    console.dir(block2StableState, { depth: 5 });
    console.dir(block3StableState, { depth: 5 });

    // console.log(block3StableState.outputs['sum'])
  });
});
