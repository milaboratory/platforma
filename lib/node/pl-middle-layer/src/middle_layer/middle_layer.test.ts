import { TestHelpers } from '@milaboratory/pl-client-v2';
import { MiddleLayer } from './middle_layer';
import { outputRef } from '../model/args';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { BlockPackRegistry, CentralRegistry } from '../block_registry';

// const EnterNumbersSpec = {
//   type: 'from-registry-v1',
//   url: 'https://block.registry.platforma.bio/releases/v1/milaboratory/enter-numbers/0.4.0'
// } as BlockPackSpecAny;
//
// const SumNumbersSpec = {
//   type: 'from-registry-v1',
//   url: 'https://block.registry.platforma.bio/releases/v1/milaboratory/sum-numbers/0.4.0'
// } as BlockPackSpecAny;

const registry = new BlockPackRegistry([
  CentralRegistry,
  {
    type: 'folder_with_dev_packages',
    label: 'Local dev registry',
    path: path.resolve('./integration')
  }
]);

async function getStandardBlockSpecs() {
  const blocksFromRegistry = await registry.getPackagesOverview();
  const enterNumbersSpecFromRemote = blocksFromRegistry.find(b =>
    b.registryLabel.match(/Central/) && b.package === 'enter-numbers'
  )!.latestSpec;
  const enterNumbersSpecFromDev = blocksFromRegistry.find(b =>
    b.registryLabel.match(/dev/) && b.package === 'enter-numbers'
  )!.latestSpec;
  const sumNumbersSpecFromRemote = blocksFromRegistry.find(b =>
    b.registryLabel.match(/Central/) && b.package === 'sum-numbers'
  )!.latestSpec;
  const sumNumbersSpecFromDev = blocksFromRegistry.find(b =>
    b.registryLabel.match(/dev/) && b.package === 'sum-numbers'
  )!.latestSpec;
  return { enterNumbersSpecFromRemote, enterNumbersSpecFromDev, sumNumbersSpecFromRemote, sumNumbersSpecFromDev };
}

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

    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');

    await projectList.refreshState();

    expect(await projectList.getValue()).toStrictEqual([{
      id: 'id1',
      rid: pRid1,
      meta: { label: 'Project 1' },
      opened: false
    }]);

    await ml.openProject(pRid1);

    expect(await projectList.getValue()).toStrictEqual([{
      id: 'id1',
      rid: pRid1,
      meta: { label: 'Project 1' },
      opened: true
    }]);

    ml.closeProject(pRid1);

    expect(await projectList.getValue()).toStrictEqual([{
      id: 'id1',
      rid: pRid1,
      meta: { label: 'Project 1' },
      opened: false
    }]);

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
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');
    await projectList.refreshState();
    expect(await projectList.getValue()).toStrictEqual([{
      id: 'id1',
      rid: pRid1,
      meta: { label: 'Project 1' },
      opened: false
    }]);
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    expect(await prj.overview.awaitStableValue()).toEqual({ meta: { label: 'Project 1' }, blocks: [] });

    const {
      enterNumbersSpecFromRemote, sumNumbersSpecFromRemote,
      enterNumbersSpecFromDev, sumNumbersSpecFromDev
    } = await getStandardBlockSpecs();
    const block1Id = await prj.addBlock('Block 1', enterNumbersSpecFromRemote);
    const block2Id = await prj.addBlock('Block 2', enterNumbersSpecFromDev);
    const block3Id = await prj.addBlock('Block 3', sumNumbersSpecFromRemote);
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
    expect(block2StableFrontend).toMatch(/block-beta-enter-numbers/);
    const block3StableFrontend = await prj.getBlockFrontend(block3Id).awaitStableValue();
    expect(block3StableFrontend).toBeDefined();
    console.dir(
      { block1StableFrontend, block2StableFrontend, block3StableFrontend },
      { depth: 5 });

    const block1StableState = await prj.getBlockState(block1Id).awaitStableValue();
    expect(block1StableState.blockPackSource).toBeDefined();
    const block2StableState = await prj.getBlockState(block2Id).awaitStableValue();
    expect(block2StableState.blockPackSource).toBeDefined();
    const block3StableState = await prj.getBlockState(block3Id).awaitStableValue();
    expect(block3StableState.blockPackSource).toBeDefined();

    console.dir(block1StableState, { depth: 5 });
    console.dir(block2StableState, { depth: 5 });
    console.dir(block3StableState, { depth: 5 });

    expect(block3StableState.outputs['sum']).toStrictEqual(18);
  });
});

test('block error test', async () => {
  const workFolder = path.resolve(`work/${randomUUID()}`);
  await fs.promises.mkdir(workFolder, { recursive: true });
  await TestHelpers.withTempRoot(async pl => {
    const ml = await MiddleLayer.init(pl, {
      frontendDownloadPath: path.resolve(workFolder),
      localSecret: 'secret'
    });
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    expect(await prj.overview.awaitStableValue()).toEqual({ meta: { label: 'Project 1' }, blocks: [] });

    const {
      enterNumbersSpecFromRemote, sumNumbersSpecFromRemote,
      enterNumbersSpecFromDev, sumNumbersSpecFromDev
    } = await getStandardBlockSpecs();

    const block3Id = await prj.addBlock('Block 3', sumNumbersSpecFromDev);

    await prj.setBlockArgs(block3Id, {
      sources: [] // empty reference list should produce an error
    });

    await prj.runBlock(block3Id);

    await prj.overview.refreshState();
    const overviewSnapshot1 = await prj.overview.awaitStableValue();

    overviewSnapshot1.blocks.forEach(block => {
      expect(block.sections).toBeDefined();
    });
    console.dir(overviewSnapshot1, { depth: 5 });

    const block3StableFrontend = await prj.getBlockFrontend(block3Id).awaitStableValue();
    expect(block3StableFrontend).toBeDefined();
    console.dir(
      { block3StableFrontend },
      { depth: 5 });

    const block3StateComputable = await prj.getBlockState(block3Id);
    await block3StateComputable.refreshState();
    const block3StableState = await prj.getBlockState(block3Id).getValueOrError();

    console.dir(block3StableState, { depth: 5 });

    // expect(block3StableState.outputs['sum']).toStrictEqual(18);
  });
});
