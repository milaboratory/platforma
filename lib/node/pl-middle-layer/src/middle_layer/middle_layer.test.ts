import { TestHelpers } from '@milaboratory/pl-client-v2';
import { MiddleLayer } from './middle_layer';
import { BlockPackSpecAny } from '../model/block_pack_spec';
import { outputRef } from '../model/args';

const EnterNumbersSpec = {
  type: 'from-registry-v1',
  url: 'https://block.registry.platforma.bio/releases/v1/milaboratory/enter-numbers/0.4.0'
} as BlockPackSpecAny;

const SumNumbersSpec = {
  type: 'from-registry-v1',
  url: 'https://block.registry.platforma.bio/releases/v1/milaboratory/sum-numbers/0.4.0'
} as BlockPackSpecAny;

test('project list manipulations test', async () => {
  await TestHelpers.withTempRoot(async pl => {
    const ml = await MiddleLayer.init(pl, 'secret');
    const projectList = ml.projectList;

    expect(await projectList.awaitStableValue()).toEqual([]);

    const pRid1 = await ml.addProject('id1', { name: 'Project 1' });

    await projectList.refreshState();

    expect(await projectList.getValue()).toStrictEqual([{ id: 'id1', rid: pRid1, meta: { name: 'Project 1' } }]);

    await ml.removeProject('id1');

    await projectList.refreshState();

    expect(await projectList.awaitStableValue()).toEqual([]);
  });
});

test('simple project manipulations test', async () => {
  await TestHelpers.withTempRoot(async pl => {
    const ml = await MiddleLayer.init(pl, 'secret');
    const projectList = ml.projectList;
    expect(await projectList.awaitStableValue()).toEqual([]);
    const pRid1 = await ml.addProject('id1', { name: 'Project 1' });
    await projectList.refreshState();
    expect(await projectList.getValue()).toStrictEqual([{ id: 'id1', rid: pRid1, meta: { name: 'Project 1' } }]);
    ml.openProject(pRid1);
    const overview = ml.getProjectOverview(pRid1);
    expect(await overview.awaitStableValue()).toEqual({ meta: { name: 'Project 1' }, blocks: [] });
    const block1Id = await ml.addBlock(pRid1, 'Block 1', EnterNumbersSpec);
    const block2Id = await ml.addBlock(pRid1, 'Block 2', EnterNumbersSpec);
    const block3Id = await ml.addBlock(pRid1, 'Block 3', SumNumbersSpec);
    await ml.setBlockArgs(pRid1, block1Id, { numbers: [1, 2, 3] });
    await ml.setBlockArgs(pRid1, block2Id, { numbers: [3, 4, 5] });
    await ml.setBlockArgs(pRid1, block3Id, {
      sources: [
        outputRef(block1Id, 'column'),
        outputRef(block2Id, 'column')
      ]
    });
    await ml.renderBlock(pRid1, block3Id)
    await overview.refreshState();
    console.log(await overview.getValue())
    // expect(await overview.getValue()).toEqual({ meta: { name: 'Project 1' }, blocks: [] });
  });
});
