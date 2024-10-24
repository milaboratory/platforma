import { test, expect } from '@jest/globals';
import { TestHelpers } from '@milaboratories/pl-client';
import { MiddleLayer } from './middle_layer';
import { outputRef } from '../model/args';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { BlockPackRegistry, CentralBlockRegistry, getDevV1PacketMtime } from '../block_registry';
import { LocalBlobHandleAndSize, RemoteBlobHandleAndSize } from '@milaboratories/pl-model-common';
import { Project } from './project';
import { LegacyDevBlockPackConfig } from '../dev_env';
import { V2RegistryProvider } from '../block_registry/registry-v2-provider';
import { Agent } from 'undici';
import { BlockPackSpec } from '@milaboratories/pl-model-middle-layer';

const registry = new BlockPackRegistry(new V2RegistryProvider(new Agent()), [
  { id: 'central', spec: CentralBlockRegistry },
  {
    id: 'dev',
    title: 'Local dev registry',
    spec: {
      type: 'local-dev',
      path: path.resolve('./integration')
    }
  }
]);

async function getStandardBlockSpecs() {
  return {
    enterNumbersSpecFromRemote: {
      type: 'from-registry-v1',
      registryUrl: 'https://block.registry.platforma.bio/releases',
      id: { organization: 'milaboratory', name: 'enter-numbers', version: '1.1.1' }
    } satisfies BlockPackSpec,
    enterNumbersSpecFromDev: {
      type: 'dev-v1',
      folder: path.resolve('./integration/block-beta-enter-numbers'),
      mtime: '1727099575979300176'
    } satisfies BlockPackSpec,
    sumNumbersSpecFromRemote: {
      type: 'from-registry-v1',
      registryUrl: 'https://block.registry.platforma.bio/releases',
      id: { organization: 'milaboratory', name: 'sum-numbers', version: '1.0.1' }
    } satisfies BlockPackSpec,
    sumNumbersSpecFromDev: {
      type: 'dev-v1',
      folder: path.resolve('./integration/block-beta-sum-numbers'),
      mtime: '1727099575981045820'
    } satisfies BlockPackSpec,
    downloadFileSpecFromRemote: {
      type: 'from-registry-v1',
      registryUrl: 'https://block.registry.platforma.bio/releases',
      id: { organization: 'milaboratory', name: 'download-file', version: '1.2.0' }
    } satisfies BlockPackSpec,
    uploadFileSpecFromRemote: {
      type: 'from-registry-v1',
      registryUrl: 'https://block.registry.platforma.bio/releases',
      id: { organization: 'milaboratory', name: 'upload-file', version: '1.0.7' }
    } satisfies BlockPackSpec,
    readLogsSpecFromRemote: {
      type: 'from-registry-v1',
      registryUrl: 'https://block.registry.platforma.bio/releases',
      id: { organization: 'milaboratory', name: 'read-logs', version: '1.0.7' }
    } satisfies BlockPackSpec
  };
}

export async function withMl(
  cb: (ml: MiddleLayer, workFolder: string) => Promise<void>
): Promise<void> {
  const workFolder = path.resolve(`work/${randomUUID()}`);

  await TestHelpers.withTempRoot(async (pl) => {
    const ml = await MiddleLayer.init(pl, workFolder, {
      defaultTreeOptions: { pollingInterval: 250, stopPollingDelay: 500 },
      devBlockUpdateRecheckInterval: 300,
      localSecret: MiddleLayer.generateLocalSecret(),
      localProjections: [], // TODO must be different with local pl
      openFileDialogCallback: () => {
        throw new Error('Not implemented.');
      }
    });
    try {
      await cb(ml, workFolder);
    } finally {
      await ml.close();
    }
  });
}

export async function awaitBlockDone(prj: Project, blockId: string, timeout: number = 2000) {
  const abortSignal = AbortSignal.timeout(timeout);
  const overview = prj.overview;
  const state = prj.getBlockState(blockId);
  // const stateAndOverview = Computable.make(() => ({ overview, state: undefined }));
  while (true) {
    // const {
    //   overview: overviewSnapshot,
    //   state: stateSnapshot
    // } = await stateAndOverview.getValue();
    const overviewSnapshot = (await overview.getValue())!;
    const blockOverview = overviewSnapshot.blocks.find((b) => b.id == blockId);
    if (blockOverview === undefined) throw new Error(`Blocks not found: ${blockId}`);
    if (blockOverview.outputErrors) return;
    if (blockOverview.calculationStatus === 'Done') return;
    try {
      await overview.awaitChange(abortSignal);
    } catch (e: any) {
      console.dir(await state.getValue(), { depth: 5 });
      throw new Error('Aborted.', { cause: e });
    }
  }
}

test('project list manipulations test', async () => {
  await withMl(async (ml) => {
    const projectList = ml.projectList;

    expect(await projectList.awaitStableValue()).toEqual([]);

    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');

    expect(await projectList.getValue()).toMatchObject([
      {
        id: 'id1',
        rid: pRid1,
        meta: { label: 'Project 1' },
        opened: false
      }
    ]);

    await ml.setProjectMeta(pRid1, { label: 'Project 1A' });

    const listSnapshot1 = await projectList.getValue();
    expect(listSnapshot1).toMatchObject([
      {
        id: 'id1',
        rid: pRid1,
        meta: { label: 'Project 1A' },
        opened: false
      }
    ]);
    expect(listSnapshot1![0].lastModified.valueOf()).toBeGreaterThan(
      listSnapshot1![0].created.valueOf()
    );

    await ml.openProject(pRid1);

    expect(await projectList.getValue()).toMatchObject([
      {
        id: 'id1',
        rid: pRid1,
        meta: { label: 'Project 1A' },
        opened: true
      }
    ]);

    await ml.closeProject(pRid1);

    expect(await projectList.getValue()).toMatchObject([
      {
        id: 'id1',
        rid: pRid1,
        meta: { label: 'Project 1A' },
        opened: false
      }
    ]);

    await ml.deleteProject('id1');

    expect(await projectList.awaitStableValue()).toEqual([]);
  });
});

test('simple project manipulations test', async () => {
  await withMl(async (ml) => {
    const projectList = ml.projectList;
    expect(await projectList.awaitStableValue()).toEqual([]);
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');
    const projectListValue1 = await projectList.getValue();
    expect(projectListValue1).toMatchObject([
      {
        id: 'id1',
        rid: pRid1,
        meta: { label: 'Project 1' },
        opened: false
      }
    ]);

    const lastModInitial = projectListValue1![0].lastModified.valueOf();

    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    expect(await prj.overview.awaitStableValue()).toMatchObject({
      meta: { label: 'Project 1' },
      authorMarker: undefined,
      blocks: []
    });

    await ml.setProjectMeta(
      pRid1,
      { label: 'New Project Label' },
      { authorId: 'test_author', localVersion: 1 }
    );
    await prj.overview.refreshState();
    expect(await prj.overview.awaitStableValue()).toMatchObject({
      meta: { label: 'New Project Label' },
      authorMarker: { authorId: 'test_author', localVersion: 1 },
      blocks: []
    });

    const {
      enterNumbersSpecFromRemote,
      sumNumbersSpecFromRemote,
      enterNumbersSpecFromDev,
      sumNumbersSpecFromDev
    } = await getStandardBlockSpecs();
    const block1Id = await prj.addBlock('Block 1', enterNumbersSpecFromRemote);
    const block2Id = await prj.addBlock('Block 2', enterNumbersSpecFromDev);
    const block3Id = await prj.addBlock('Block 3', sumNumbersSpecFromRemote);

    expect(await prj.overview.awaitStableValue()).toMatchObject({
      meta: { label: 'New Project Label' },
      authorMarker: undefined
    });

    const overviewSnapshot0 = await prj.overview.awaitStableValue();

    overviewSnapshot0.blocks.forEach((block) => {
      expect(block.sections).toBeDefined();
      expect(block.canRun).toEqual(false);
      expect(block.currentBlockPack).toBeDefined();
      expect(block.navigationState).toStrictEqual({ href: '/' });
    });

    const block1StableState0 = await prj.getBlockState(block1Id).awaitStableValue();
    const block2StableState0 = await prj.getBlockState(block2Id).awaitStableValue();
    const block3StableState0 = await prj.getBlockState(block3Id).awaitStableValue();

    await prj.setNavigationState(block1Id, { href: '/section1' });
    await prj.setBlockArgs(block1Id, { numbers: [1, 2, 3] });
    await prj.setBlockArgs(block2Id, { numbers: [3, 4, 5] });
    await prj.setBlockArgs(block3Id, {
      sources: [outputRef(block1Id, 'column'), outputRef(block2Id, 'column')]
    });
    await prj.runBlock(block3Id);
    await awaitBlockDone(prj, block3Id);

    const overviewSnapshot1 = await prj.overview.awaitStableValue();

    expect(overviewSnapshot1.lastModified.valueOf()).toBeGreaterThan(lastModInitial);

    overviewSnapshot1.blocks.forEach((block) => {
      expect(block.sections).toBeDefined();
      expect(block.canRun).toEqual(false);
      expect(block.stale).toEqual(false);
      expect(block.currentBlockPack).toBeDefined();
      if (block.id === block1Id) expect(block.navigationState).toStrictEqual({ href: '/section1' });
      else expect(block.navigationState).toStrictEqual({ href: '/' });
    });
    // console.dir(overviewSnapshot1, { depth: 5 });

    const block1StableFrontend = await prj.getBlockFrontend(block1Id).awaitStableValue();
    expect(block1StableFrontend.path).toBeDefined();
    expect(block1StableFrontend.sdkVersion).toBeDefined();
    const block2StableFrontend = await prj.getBlockFrontend(block2Id).awaitStableValue();
    expect(block2StableFrontend.path).toMatch(/block-beta-enter-numbers/);
    expect(block2StableFrontend.sdkVersion).toBeDefined();
    const block3StableFrontend = await prj.getBlockFrontend(block3Id).awaitStableValue();
    expect(block3StableFrontend.path).toBeDefined();
    expect(block3StableFrontend.sdkVersion).toBeDefined();
    // console.dir(
    //   { block1StableFrontend, block2StableFrontend, block3StableFrontend },
    //   { depth: 5 });

    const block1StableState1 = await prj.getBlockState(block1Id).awaitStableValue();
    const block2StableState1 = await prj.getBlockState(block2Id).awaitStableValue();
    const block3StableState1 = await prj.getBlockState(block3Id).awaitStableValue();

    expect(block1StableState1.navigationState).toStrictEqual({ href: '/section1' });
    expect(block2StableState1.navigationState).toStrictEqual({ href: '/' });
    expect(block3StableState1.navigationState).toStrictEqual({ href: '/' });
    // console.dir(block1StableState1, { depth: 5 });
    // console.dir(block2StableState1, { depth: 5 });
    // console.dir(block3StableState1, { depth: 5 });

    expect(block3StableState1.outputs!['sum']).toStrictEqual({
      ok: true,
      value: 18
    });

    await prj.resetBlockArgsAndUiState(block2Id);

    const block2Inputs = await prj.getBlockState(block2Id).getValue();
    expect(block2Inputs.args).toEqual({ numbers: [] });

    const overviewSnapshot2 = await prj.overview.awaitStableValue();
    expect(overviewSnapshot2.blocks.find((b) => b.id === block3Id)?.canRun).toEqual(false);
    expect(overviewSnapshot2.blocks.find((b) => b.id === block3Id)?.stale).toEqual(true);
    expect(overviewSnapshot2.blocks.find((b) => b.id === block2Id)?.stale).toEqual(true);
  });
}, 20000);

test('reorder & rename blocks', async () => {
  await withMl(async (ml) => {
    const projectList = ml.projectList;
    expect(await projectList.awaitStableValue()).toEqual([]);
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');

    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    const {
      enterNumbersSpecFromRemote,
      sumNumbersSpecFromRemote,
      enterNumbersSpecFromDev,
      sumNumbersSpecFromDev
    } = await getStandardBlockSpecs();
    const block1Id = await prj.addBlock('Block 1', enterNumbersSpecFromRemote);
    const block2Id = await prj.addBlock('Block 2', enterNumbersSpecFromDev);
    const block3Id = await prj.addBlock('Block 3', sumNumbersSpecFromRemote);

    const overviewSnapshot0 = await prj.overview.awaitStableValue();

    overviewSnapshot0.blocks.forEach((block) => {
      expect(block.sections).toBeDefined();
      expect(block.canRun).toEqual(false);
      expect(block.currentBlockPack).toBeDefined();
      expect(block.navigationState).toStrictEqual({ href: '/' });
    });

    await prj.setNavigationState(block1Id, { href: '/section1' });
    await prj.setBlockArgs(block1Id, { numbers: [1, 2, 3] });
    await prj.setBlockArgs(block2Id, { numbers: [3, 4, 5] });
    await prj.setBlockArgs(block3Id, {
      sources: [outputRef(block1Id, 'column'), outputRef(block2Id, 'column')]
    });
    await prj.runBlock(block3Id);
    await awaitBlockDone(prj, block3Id);

    const overviewSnapshot1 = await prj.overview.awaitStableValue();
    expect(overviewSnapshot1).toMatchObject({
      blocks: [
        { id: block1Id, calculationStatus: 'Done' },
        { id: block2Id, calculationStatus: 'Done' },
        { id: block3Id, calculationStatus: 'Done' }
      ]
    });

    await prj.reorderBlocks([block2Id, block3Id, block1Id]);

    const overviewSnapshot2 = await prj.overview.awaitStableValue();
    expect(overviewSnapshot2).toMatchObject({
      blocks: [
        { id: block2Id, calculationStatus: 'Done' },
        { id: block3Id, calculationStatus: 'Limbo' },
        { id: block1Id, calculationStatus: 'Done' }
      ]
    });

    await prj.setBlockLabel(block3Id, 'New Block Label');
    const overviewSnapshot3 = await prj.overview.awaitStableValue();
    expect(overviewSnapshot3).toMatchObject({
      blocks: [
        { id: block2Id, calculationStatus: 'Done' },
        { id: block3Id, calculationStatus: 'Limbo', label: 'New Block Label' },
        { id: block1Id, calculationStatus: 'Done' }
      ]
    });
  });
});

test('limbo test', async () => {
  await withMl(async (ml) => {
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    const { enterNumbersSpecFromRemote, sumNumbersSpecFromRemote } = await getStandardBlockSpecs();
    const block1Id = await prj.addBlock('Block 1', enterNumbersSpecFromRemote);
    const block2Id = await prj.addBlock('Block 2', sumNumbersSpecFromRemote);

    const overview0 = await prj.overview.awaitStableValue();
    overview0.blocks.forEach((block) => {
      expect(block.sections).toBeDefined();
      expect(block.canRun).toEqual(false);
      expect(block.currentBlockPack).toBeDefined();
    });

    await prj.setBlockArgs(block1Id, { numbers: [1, 2, 3] });
    await prj.setBlockArgs(block2Id, {
      sources: [outputRef(block1Id, 'column')]
    });

    const overview1 = await prj.overview.awaitStableValue();
    overview1.blocks.forEach((block) => {
      expect(block.sections).toBeDefined();
      expect(block.canRun).toEqual(true);
      expect(block.currentBlockPack).toBeDefined();
    });

    await prj.runBlock(block2Id);
    await awaitBlockDone(prj, block2Id);

    const block2StableState1 = await prj.getBlockState(block2Id).getValue();
    expect(block2StableState1.outputs!['sum']).toStrictEqual({
      ok: true,
      value: 6
    });

    const overview2 = await prj.overview.awaitStableValue();
    overview2.blocks.forEach((block) => {
      expect(block.sections).toBeDefined();
      expect(block.calculationStatus).toEqual('Done');
      expect(block.canRun).toEqual(false);
      expect(block.currentBlockPack).toBeDefined();
    });

    await prj.setBlockArgs(block1Id, { numbers: [2, 3] });
    await prj.runBlock(block1Id);
    await awaitBlockDone(prj, block1Id);

    const overview3 = await prj.overview.awaitStableValue();
    const [overview3Block1, overview3Block2] = overview3.blocks;
    expect(overview3Block1.calculationStatus).toEqual('Done');
    expect(overview3Block2.calculationStatus).toEqual('Limbo');

    await prj.runBlock(block2Id);
    await awaitBlockDone(prj, block2Id);

    const block2StableState2 = await prj.getBlockState(block2Id).getValue();
    expect(block2StableState2.outputs!['sum']).toStrictEqual({
      ok: true,
      value: 5
    });

    const overview4 = await prj.overview.awaitStableValue();
    const [overview4Block1, overview4Block2] = overview4.blocks;
    expect(overview4Block1.calculationStatus).toEqual('Done');
    expect(overview4Block2.calculationStatus).toEqual('Done');
  });
});

test('block update test', async () => {
  await withMl(async (ml, workFolder) => {
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    const tmpDevBlockFolder = path.resolve(workFolder, 'dev');
    await fs.promises.mkdir(tmpDevBlockFolder, { recursive: true });

    const devBlockPath = path.resolve(tmpDevBlockFolder, 'block-beta-enter-numbers');
    await fs.promises.cp(path.resolve('integration', 'block-beta-enter-numbers'), devBlockPath, {
      recursive: true
    });
    const mtime = await getDevV1PacketMtime(devBlockPath);
    const block1Id = await prj.addBlock('Block 1', {
      type: 'dev-v1',
      folder: devBlockPath,
      mtime
    });

    const overview0 = await prj.overview.awaitStableValue();
    expect(overview0.blocks[0].updatedBlockPack).toBeUndefined();

    // touch
    await fs.promises.appendFile(path.resolve(devBlockPath, ...LegacyDevBlockPackConfig), ' ');

    // await update watcher
    await prj.overview.refreshState();
    const overview1 = await prj.overview.awaitStableValue();
    expect(overview1.blocks[0].updatedBlockPack).toBeDefined();

    await prj.updateBlockPack(block1Id, overview1.blocks[0].updatedBlockPack!);

    const overview2 = await prj.overview.awaitStableValue();
    expect(overview2.blocks[0].currentBlockPack).toStrictEqual(
      overview1.blocks[0].updatedBlockPack
    );
    expect(overview2.blocks[0].updatedBlockPack).toBeUndefined();
  });
});

test('project open and close test', async () => {
  await withMl(async (ml, workFolder) => {
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');
    await ml.openProject(pRid1);
    let prj = ml.getOpenedProject(pRid1);

    const blockId = await prj.addBlock('Test Block', {
      type: 'from-registry-v1',
      registryUrl: 'https://block.registry.platforma.bio/releases',
      id: { organization: 'milaboratory', name: 'enter-numbers', version: '1.1.1' }
    });
    await prj.setBlockArgs(blockId, { numbers: [1, 2, 3] });
    const overview1 = await prj.overview.awaitStableValue();
    expect(overview1.blocks[0].canRun).toEqual(true);

    ml.closeProject(pRid1);
    await ml.openProject(pRid1);
    prj = ml.getOpenedProject(pRid1);

    const overview2 = await prj.overview.awaitStableValue();
    expect(overview2.blocks[0].canRun).toEqual(true);
  });
});

test('block error test', async () => {
  await withMl(async (ml) => {
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    expect(await prj.overview.awaitStableValue()).toMatchObject({
      meta: { label: 'Project 1' },
      blocks: []
    });

    const {
      enterNumbersSpecFromRemote,
      sumNumbersSpecFromRemote,
      enterNumbersSpecFromDev,
      sumNumbersSpecFromDev
    } = await getStandardBlockSpecs();

    const block3Id = await prj.addBlock('Block 3', sumNumbersSpecFromDev);

    await prj.setBlockArgs(block3Id, {
      sources: [] // empty reference list should produce an error
    });

    await prj.runBlock(block3Id);
    await awaitBlockDone(prj, block3Id);

    const overviewSnapshot1 = await prj.overview.awaitStableValue();

    overviewSnapshot1.blocks.forEach((block) => {
      expect(block.sections).toBeDefined();
    });
    expect(overviewSnapshot1.blocks[0].outputErrors).toStrictEqual(true);

    const block3StableState = await prj.getBlockState(block3Id).getValue();

    const sum = block3StableState.outputs!['sum'];
    expect(sum.ok).toStrictEqual(false);
    if (!sum.ok) expect(sum.errors[0]).toContain('tengo-mistd');
  });
});

test('should create download-file block, render it and gets outputs from its config', async () => {
  await withMl(async (ml) => {
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    expect(await prj.overview.awaitStableValue()).toMatchObject({
      meta: { label: 'Project 1' },
      blocks: []
    });

    const { downloadFileSpecFromRemote } = await getStandardBlockSpecs();

    const block3Id = await prj.addBlock('Block 3', downloadFileSpecFromRemote);

    await prj.setBlockArgs(block3Id, {
      storageId: 'library',
      filePath: 'answer_to_the_ultimate_question.txt'
    });

    await prj.runBlock(block3Id);
    await awaitBlockDone(prj, block3Id);

    const overviewSnapshot1 = await prj.overview.awaitStableValue();

    overviewSnapshot1.blocks.forEach((block) => {
      expect(block.sections).toBeDefined();
    });
    console.dir(overviewSnapshot1, { depth: 5 });

    const block3StableFrontend = await prj.getBlockFrontend(block3Id).awaitStableValue();
    expect(block3StableFrontend).toBeDefined();
    console.dir({ block3StableFrontend }, { depth: 5 });

    const block3StateComputable = prj.getBlockState(block3Id);

    const block3StableState = await block3StateComputable.awaitStableFullValue();

    console.dir(block3StableState, { depth: 5 });

    expect((block3StableState.value.outputs!['contentAsJson'] as any).value).toStrictEqual(42);
    const localBlob = (block3StableState.value.outputs!['downloadedBlobContent'] as any)
      .value as LocalBlobHandleAndSize;
    const remoteBlob = (block3StableState.value.outputs!['onDemandBlobContent'] as any)
      .value as RemoteBlobHandleAndSize;

    expect(
      Buffer.from(await ml.driverKit.blobDriver.getContent(localBlob.handle)).toString('utf-8')
    ).toEqual('42\n');

    expect(
      Buffer.from(await ml.driverKit.blobDriver.getContent(remoteBlob.handle)).toString('utf-8')
    ).toEqual('42\n');
  });
});

test('should create upload-file block, render it and upload a file to pl server', async () => {
  await withMl(async (ml) => {
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    expect(await prj.overview.awaitStableValue()).toMatchObject({
      meta: { label: 'Project 1' },
      blocks: []
    });

    const { uploadFileSpecFromRemote } = await getStandardBlockSpecs();
    // const uploadFileSpecFromDev: BlockPackSpec = {
    //   type: 'dev',
    //   folder: '/home/snyssfx/prog/mi/tpls/block-beta-upload-file',
    // }

    const block3Id = await prj.addBlock('Block 3', uploadFileSpecFromRemote);

    const storages = await ml.driverKit.lsDriver.getStorageList();
    const local = storages.find((s) => s.name == 'local');
    expect(local).not.toBeUndefined();
    const fileDir = path.resolve(__dirname, '..', '..', '..', '..', '..', 'assets');
    const files = await ml.driverKit.lsDriver.listFiles(local!.handle, fileDir);
    const ourFile = files.entries.find(
      (f) => f.name == 'another_answer_to_the_ultimate_question.txt'
    );
    expect(ourFile).not.toBeUndefined();
    expect(ourFile?.type).toBe('file');

    await prj.setBlockArgs(block3Id, {
      importHandle: (ourFile as any).handle
    });

    await prj.runBlock(block3Id);
    await awaitBlockDone(prj, block3Id, 5000);

    const block3StateComputable = prj.getBlockState(block3Id);

    while (true) {
      const state = await block3StateComputable.getFullValue();

      // console.dir(state, { depth: 5 });

      if (state.stable && (state.value.outputs!['handle'] as any).value != undefined) {
        expect(state.type).toEqual('ok');
        expect((state.value.outputs!['handle'] as any).value.isUpload).toBeTruthy();
        expect((state.value.outputs!['handle'] as any).value.done).toBeTruthy();
        return;
      }

      await block3StateComputable.awaitChange();
    }
  });
});

// TODO: fix. It was skipped because of RunCommand breaking change in pl-core.
// The block should be rewrote from milib to tengo-sdk
test.skip('should create read-logs block, render it and read logs from a file', async () => {
  await withMl(async (ml) => {
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    expect(await prj.overview.awaitStableValue()).toMatchObject({
      meta: { label: 'Project 1' },
      blocks: []
    });

    const { readLogsSpecFromRemote } = await getStandardBlockSpecs();
    // const readLogsSpecFromDev: BlockPackSpec = {
    //   type: 'dev',
    //   folder: '/home/snyssfx/prog/mi/tpls/block-beta-read-logs',
    // }
    const block3Id = await prj.addBlock('Block 3', readLogsSpecFromRemote);

    const storages = await ml.driverKit.lsDriver.getStorageList();
    const library = storages.find((s) => s.name == 'library');
    expect(library).toBeDefined();
    const files = await ml.driverKit.lsDriver.listFiles(library!.handle, '');
    const ourFile = files.entries.find(
      (f) => f.name == 'maybe_the_number_of_lines_is_the_answer.txt'
    );
    expect(ourFile).toBeDefined();
    expect(ourFile?.type).toBe('file');

    await prj.setBlockArgs(block3Id, {
      fileHandle: (ourFile as any).handle,
      // args are from here:
      // https://github.com/milaboratory/sleep/blob/3c046cdcc504b63f1a6e592a4aa87ee773a94d72/read-file-to-stdout-with-sleep.go#L24
      readFileWithSleepArgs: ['file.txt', 'PREFIX', '100', '1000']
    });

    await prj.runBlock(block3Id);
    await awaitBlockDone(prj, block3Id, 15000);

    const computable = prj.getBlockState(block3Id);
    // await computable.refreshState();

    while (true) {
      const state = await computable.getFullValue();
      console.dir(state, { depth: 5 });

      if (
        state.stable &&
        state.value.outputs!['lastLogs'].ok &&
        state.value.outputs!['lastLogs'].value != undefined
      ) {
        expect((state.value.outputs!['progressLog'] as any).value).toContain('PREFIX');
        expect((state.value.outputs!['progressLog'] as any).value).toContain('bytes read');
        expect((state.value.outputs!['lastLogs'] as any).value.split('\n').length).toEqual(10 + 1); // 11 because the last element is empty
        return;
      }

      await computable.awaitChange();
    }
  });
  // The timeout is higher here because pl-core must download a software for this test.
}, 20000);
