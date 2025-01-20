import { blockSpec as downloadFileSpec } from '@milaboratories/milaboratories.test-download-file';
import { platforma as downloadFileModel } from '@milaboratories/milaboratories.test-download-file.model';
import { blockSpec as downloadBlobURLSpec } from '@milaboratories/milaboratories.test-blob-url-custom-protocol';
import { platforma as downloadBlobURLModel } from '@milaboratories/milaboratories.test-blob-url-custom-protocol.model';
import { blockSpec as enterNumberSpec } from '@milaboratories/milaboratories.test-enter-numbers';
import { blockSpec as readLogsSpec } from '@milaboratories/milaboratories.test-read-logs';
import { platforma as readLogsModel } from '@milaboratories/milaboratories.test-read-logs.model';
import { blockSpec as sumNumbersSpec } from '@milaboratories/milaboratories.test-sum-numbers';
import { blockSpec as uploadFileSpec } from '@milaboratories/milaboratories.test-upload-file';
import { platforma as uploadFileModel } from '@milaboratories/milaboratories.test-upload-file.model';
import { PlClient } from '@milaboratories/pl-client';
import {
  FolderURL,
  ImportFileHandle,
  InferBlockState,
  InitialBlockSettings,
  LocalBlobHandleAndSize,
  MiddleLayer,
  PlRef,
  Project,
  RemoteBlobHandleAndSize,
  TestHelpers
} from '@milaboratories/pl-middle-layer';
import { awaitStableState, blockTest } from '@platforma-sdk/test';
import fs from 'fs';
import { randomUUID } from 'node:crypto';
import path from 'path';
import { test } from 'vitest';

export async function withMl(
  cb: (ml: MiddleLayer, workFolder: string) => Promise<void>
): Promise<void> {
  const workFolder = path.resolve(`work/${randomUUID()}`);

  await TestHelpers.withTempRoot(async (pl: PlClient) => {
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
      console.log(JSON.stringify(pl.allTxStat));
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

test('project list manipulations test', async ({ expect }) => {
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

test('simple project manipulations test', { timeout: 20000 }, async ({ expect }) => {
  // Baseline stat:
  // (1a) {"committed":{"txCount":41,"rootsCreated":0,"structsCreated":18,"structsCreatedDataBytes":487161,"ephemeralsCreated":125,"ephemeralsCreatedDataBytes":3033,"valuesCreated":113,"valuesCreatedDataBytes":574938,"kvSetRequests":33,"kvSetBytes":33,"inputsLocked":79,"outputsLocked":59,"fieldsCreated":439,"fieldsSet":516,"fieldsGet":3,"rGetDataCacheHits":180,"rGetDataCacheFields":0,"rGetDataCacheBytes":160264,"rGetDataNetRequests":129,"rGetDataNetFields":578,"rGetDataNetBytes":478364,"kvListRequests":121,"kvListEntries":283,"kvListBytes":19773,"kvGetRequests":75,"kvGetBytes":5212},"conflict":{"txCount":1,"rootsCreated":0,"structsCreated":0,"structsCreatedDataBytes":0,"ephemeralsCreated":24,"ephemeralsCreatedDataBytes":630,"valuesCreated":4,"valuesCreatedDataBytes":86,"kvSetRequests":1,"kvSetBytes":1,"inputsLocked":10,"outputsLocked":6,"fieldsCreated":26,"fieldsSet":40,"fieldsGet":0,"rGetDataCacheHits":21,"rGetDataCacheFields":0,"rGetDataCacheBytes":434,"rGetDataNetRequests":4,"rGetDataNetFields":31,"rGetDataNetBytes":0,"kvListRequests":1,"kvListEntries":9,"kvListBytes":703,"kvGetRequests":5,"kvGetBytes":427},"error":{"txCount":0,"rootsCreated":0,"structsCreated":0,"structsCreatedDataBytes":0,"ephemeralsCreated":0,"ephemeralsCreatedDataBytes":0,"valuesCreated":0,"valuesCreatedDataBytes":0,"kvSetRequests":0,"kvSetBytes":0,"inputsLocked":0,"outputsLocked":0,"fieldsCreated":0,"fieldsSet":0,"fieldsGet":0,"rGetDataCacheHits":0,"rGetDataCacheFields":0,"rGetDataCacheBytes":0,"rGetDataNetRequests":0,"rGetDataNetFields":0,"rGetDataNetBytes":0,"kvListRequests":0,"kvListEntries":0,"kvListBytes":0,"kvGetRequests":0,"kvGetBytes":0}}
  // (2a) {"committed":{"txCount":41,"rootsCreated":0,"structsCreated":18,"structsCreatedDataBytes":487161,"ephemeralsCreated":113,"ephemeralsCreatedDataBytes":2718,"valuesCreated":111,"valuesCreatedDataBytes":574895,"kvSetRequests":32,"kvSetBytes":32,"inputsLocked":74,"outputsLocked":56,"fieldsCreated":432,"fieldsSet":496,"fieldsGet":3,"rGetDataCacheHits":180,"rGetDataCacheFields":0,"rGetDataCacheBytes":160269,"rGetDataNetRequests":128,"rGetDataNetFields":573,"rGetDataNetBytes":478364,"kvListRequests":120,"kvListEntries":284,"kvListBytes":19830,"kvGetRequests":75,"kvGetBytes":5212},"conflict":{"txCount":1,"rootsCreated":0,"structsCreated":0,"structsCreatedDataBytes":0,"ephemeralsCreated":0,"ephemeralsCreatedDataBytes":0,"valuesCreated":1,"valuesCreatedDataBytes":14,"kvSetRequests":2,"kvSetBytes":2,"inputsLocked":0,"outputsLocked":0,"fieldsCreated":0,"fieldsSet":7,"fieldsGet":2,"rGetDataCacheHits":34,"rGetDataCacheFields":0,"rGetDataCacheBytes":158963,"rGetDataNetRequests":1,"rGetDataNetFields":34,"rGetDataNetBytes":0,"kvListRequests":1,"kvListEntries":9,"kvListBytes":703,"kvGetRequests":5,"kvGetBytes":427},"error":{"txCount":0,"rootsCreated":0,"structsCreated":0,"structsCreatedDataBytes":0,"ephemeralsCreated":0,"ephemeralsCreatedDataBytes":0,"valuesCreated":0,"valuesCreatedDataBytes":0,"kvSetRequests":0,"kvSetBytes":0,"inputsLocked":0,"outputsLocked":0,"fieldsCreated":0,"fieldsSet":0,"fieldsGet":0,"rGetDataCacheHits":0,"rGetDataCacheFields":0,"rGetDataCacheBytes":0,"rGetDataNetRequests":0,"rGetDataNetFields":0,"rGetDataNetBytes":0,"kvListRequests":0,"kvListEntries":0,"kvListBytes":0,"kvGetRequests":0,"kvGetBytes":0}}
  // (1b) {"committed":{"txCount":41,"rootsCreated":0,"structsCreated":18,"structsCreatedDataBytes":487161,"ephemeralsCreated":113,"ephemeralsCreatedDataBytes":2718,"valuesCreated":111,"valuesCreatedDataBytes":574895,"kvSetRequests":32,"kvSetBytes":32,"inputsLocked":71,"outputsLocked":53,"fieldsCreated":377,"fieldsSet":441,"fieldsGet":3,"rGetDataCacheHits":180,"rGetDataCacheFields":0,"rGetDataCacheBytes":160269,"rGetDataNetRequests":127,"rGetDataNetFields":569,"rGetDataNetBytes":478364,"kvListRequests":118,"kvListEntries":284,"kvListBytes":19830,"kvGetRequests":75,"kvGetBytes":5212},"conflict":{"txCount":3,"rootsCreated":0,"structsCreated":0,"structsCreatedDataBytes":0,"ephemeralsCreated":24,"ephemeralsCreatedDataBytes":630,"valuesCreated":6,"valuesCreatedDataBytes":119,"kvSetRequests":4,"kvSetBytes":4,"inputsLocked":10,"outputsLocked":6,"fieldsCreated":26,"fieldsSet":48,"fieldsGet":2,"rGetDataCacheHits":67,"rGetDataCacheFields":0,"rGetDataCacheBytes":159215,"rGetDataNetRequests":4,"rGetDataNetFields":72,"rGetDataNetBytes":0,"kvListRequests":3,"kvListEntries":27,"kvListBytes":2109,"kvGetRequests":15,"kvGetBytes":1281},"error":{"txCount":0,"rootsCreated":0,"structsCreated":0,"structsCreatedDataBytes":0,"ephemeralsCreated":0,"ephemeralsCreatedDataBytes":0,"valuesCreated":0,"valuesCreatedDataBytes":0,"kvSetRequests":0,"kvSetBytes":0,"inputsLocked":0,"outputsLocked":0,"fieldsCreated":0,"fieldsSet":0,"fieldsGet":0,"rGetDataCacheHits":0,"rGetDataCacheFields":0,"rGetDataCacheBytes":0,"rGetDataNetRequests":0,"rGetDataNetFields":0,"rGetDataNetBytes":0,"kvListRequests":0,"kvListEntries":0,"kvListBytes":0,"kvGetRequests":0,"kvGetBytes":0}}
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

    const block1Id = await prj.addBlock('Block 1', enterNumberSpec);
    const block2Id = await prj.addBlock('Block 2', enterNumberSpec);
    const block3Id = await prj.addBlock('Block 3', sumNumbersSpec);

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

    expect(block1StableState0.outputs!['activeArgs']).toStrictEqual({
      ok: true,
      value: undefined
    });

    await prj.setNavigationState(block1Id, { href: '/section1' });
    await prj.setBlockArgs(block1Id, { numbers: [1, 2, 3] });
    await prj.setBlockArgs(block2Id, { numbers: [3, 4, 5] });
    await prj.setBlockArgs(block3Id, {
      sources: [outputRef(block1Id, 'numbers'), outputRef(block2Id, 'numbers')]
    });
    await prj.runBlock(block3Id);
    await awaitBlockDone(prj, block3Id);
    const overviewSnapshot1 = await prj.overview.awaitStableValue();
    expect(overviewSnapshot1.lastModified.valueOf()).toBeGreaterThan(lastModInitial);

    overviewSnapshot1.blocks.forEach((block) => {
      expect(block.settings).toMatchObject(InitialBlockSettings);
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
    expect(block2StableFrontend.path).toMatch(/enter-numbers/);
    expect(block2StableFrontend.sdkVersion).toBeDefined();
    const block3StableFrontend = await prj.getBlockFrontend(block3Id).awaitStableValue();
    expect(block3StableFrontend.path).toBeDefined();
    expect(block3StableFrontend.sdkVersion).toBeDefined();
    // console.dir({ block1StableFrontend, block2StableFrontend, block3StableFrontend }, { depth: 5 });

    const block1StableState1 = await prj.getBlockState(block1Id).awaitStableValue();
    const block2StableState1 = await prj.getBlockState(block2Id).awaitStableValue();
    const block3StableState1 = await prj.getBlockState(block3Id).awaitStableValue();
    expect(block1StableState1.navigationState).toStrictEqual({ href: '/section1' });
    expect(block2StableState1.navigationState).toStrictEqual({ href: '/' });
    expect(block3StableState1.navigationState).toStrictEqual({ href: '/' });
    console.dir(block1StableState1, { depth: 5 });
    console.dir(block2StableState1, { depth: 5 });
    console.dir(block3StableState1, { depth: 5 });

    expect(block1StableState1.outputs!['activeArgs']).toStrictEqual({
      ok: true,
      value: { numbers: [1, 2, 3] }
    });

    expect(block3StableState1.outputs!['sum']).toStrictEqual({
      ok: true,
      value: 18
    });

    await prj.resetBlockArgsAndUiState(block2Id);
    await prj.setBlockSettings(block2Id, { versionLock: 'patch' });

    const block2Inputs = await prj.getBlockState(block2Id).getValue();
    expect(block2Inputs.args).toEqual({ numbers: [] });

    const overviewSnapshot2 = await prj.overview.awaitStableValue();
    expect(overviewSnapshot2.blocks.find((b) => b.id === block3Id)?.canRun).toEqual(false);
    expect(overviewSnapshot2.blocks.find((b) => b.id === block3Id)?.stale).toEqual(true);
    expect(overviewSnapshot2.blocks.find((b) => b.id === block2Id)?.stale).toEqual(true);
    expect(overviewSnapshot2.blocks.find((b) => b.id === block2Id)?.settings).toEqual({
      versionLock: 'patch'
    });
  });
});

test('reorder & rename blocks', async ({ expect }) => {
  await withMl(async (ml) => {
    const projectList = ml.projectList;
    expect(await projectList.awaitStableValue()).toEqual([]);
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');

    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    const block1Id = await prj.addBlock('Block 1', enterNumberSpec);
    const block2Id = await prj.addBlock('Block 2', enterNumberSpec);
    const block3Id = await prj.addBlock('Block 3', sumNumbersSpec);

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
      sources: [outputRef(block1Id, 'numbers'), outputRef(block2Id, 'numbers')]
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

    // await prj.setBlockLabel(block3Id, 'New Block Label');
    // const overviewSnapshot3 = await prj.overview.awaitStableValue();
    // expect(overviewSnapshot3).toMatchObject({
    //   blocks: [
    //     { id: block2Id, calculationStatus: 'Done' },
    //     { id: block3Id, calculationStatus: 'Limbo', label: 'New Block Label' },
    //     { id: block1Id, calculationStatus: 'Done' }
    //   ]
    // });
  });
});

test('limbo test', async ({ expect }) => {
  await withMl(async (ml) => {
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    const block1Id = await prj.addBlock('Block 1', enterNumberSpec);
    const block2Id = await prj.addBlock('Block 2', sumNumbersSpec);

    const overview0 = await prj.overview.awaitStableValue();
    overview0.blocks.forEach((block) => {
      expect(block.sections).toBeDefined();
      expect(block.canRun).toEqual(false);
      expect(block.currentBlockPack).toBeDefined();
    });

    await prj.setBlockArgs(block1Id, { numbers: [1, 2, 3] });
    await prj.setBlockArgs(block2Id, {
      sources: [outputRef(block1Id, 'numbers')]
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

test('block update test', async ({ expect }) => {
  await withMl(async (ml, workFolder) => {
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    const tmpDevBlockFolder = path.resolve(workFolder, 'dev');
    await fs.promises.mkdir(tmpDevBlockFolder, { recursive: true });

    const block1Id = await prj.addBlock('Block 1', enterNumberSpec);

    const overview0 = await prj.overview.awaitStableValue();
    expect(overview0.blocks[0].updatedBlockPack).toBeUndefined();

    // touch
    await fs.promises.appendFile(
      path.resolve('..', '..', 'etc', 'blocks', 'enter-numbers', 'model', 'dist', 'model.json'),
      ' '
    );

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

test('project open and close test', async ({ expect }) => {
  await withMl(async (ml) => {
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');
    await ml.openProject(pRid1);
    let prj = ml.getOpenedProject(pRid1);

    const blockId = await prj.addBlock('Test Block', enterNumberSpec);
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

test('block error test', async ({ expect }) => {
  await withMl(async (ml) => {
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    expect(await prj.overview.awaitStableValue()).toMatchObject({
      meta: { label: 'Project 1' },
      blocks: []
    });

    const block3Id = await prj.addBlock('Block 3', sumNumbersSpec);

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
    if (!sum.ok)
      expect(sum.errors[0]).toContain(
        "At least 1 data source must be set. It's needed in 'block error test'"
      );
  });
});

blockTest(
  'should create download-file block, render it and gets outputs from its config',
  async ({ rawPrj: project, ml, expect }) => {
    const blockId = await project.addBlock('DownloadFile', downloadFileSpec);

    const inputHandle = await lsDriverGetFileHandleFromAssets(
      ml,
      expect,
      'answer_to_the_ultimate_question.txt'
    );

    await project.setBlockArgs(blockId, { inputHandle });

    await project.runBlock(blockId);

    while (true) {
      const state = (await awaitStableState(
        project.getBlockState(blockId),
        25000
      )) as InferBlockState<typeof downloadFileModel>;
      // console.dir(state, { depth: 5 });

      const blockFrontend = await project.getBlockFrontend(blockId).awaitStableValue();
      expect(blockFrontend).toBeDefined();
      console.dir(blockFrontend, { depth: 5 });

      const outputs = state.outputs;

      if (outputs.contentAsString.ok) {
        expect(outputs.contentAsString.value).toStrictEqual('42\n');
        expect((outputs.contentAsJson as any).value).toStrictEqual(42);
        const localBlob = (outputs.downloadedBlobContent as any).value as LocalBlobHandleAndSize;
        const remoteBlob = (outputs.onDemandBlobContent as any).value as RemoteBlobHandleAndSize;

        expect(
          Buffer.from(await ml.driverKit.blobDriver.getContent(localBlob.handle)).toString('utf-8')
        ).toEqual('42\n');

        expect(
          Buffer.from(await ml.driverKit.blobDriver.getContent(remoteBlob.handle)).toString('utf-8')
        ).toEqual('42\n');

        return;
      }
    }
  }
);

blockTest(
  'should create blob-url-custom-protocol block, render it and gets outputs from its config',
  {timeout: 30000},
  async ({ rawPrj: project, ml, expect }) => {
    const blockId = await project.addBlock('DownloadBlobUrl', downloadBlobURLSpec);

    const inputHandle = await lsDriverGetFileHandleFromAssets(
      ml,
      expect,
      'funny_cats_site.tar.gz',
    );

    await project.setBlockArgs(blockId, { inputHandle });

    await project.runBlock(blockId);

    while (true) {
      const state = (await awaitStableState(
        project.getBlockState(blockId),
        13000
      )) as InferBlockState<typeof downloadBlobURLModel>;
      // console.dir(state, { depth: 5 });

      const blockFrontend = await project.getBlockFrontend(blockId).awaitStableValue();
      expect(blockFrontend).toBeDefined();
      console.dir(blockFrontend, { depth: 5 });

      const outputs = state.outputs;

      if (outputs.tar_gz_content.ok) {
        const url = outputs.tar_gz_content.value;
        expect(url).not.toBeUndefined();
        console.dir(ml.driverKit.blobToURLDriver.info(), { depth: 150 });

        const defaultUrl = ml.driverKit.blobToURLDriver.getPathForCustomProtocol(url);
        expect(defaultUrl).matches(/.*index.html$/);

        const styles = ml.driverKit.blobToURLDriver.getPathForCustomProtocol((url + '/styles.css') as FolderURL);
        expect(styles).matches(/.*\/styles.css/);

        return;
      }
    }
  }
);

blockTest(
  'should create upload-file block, render it and upload a file to pl server',
  async ({ rawPrj: project, ml, expect }) => {
    const blockId = await project.addBlock('UpdateFile', uploadFileSpec);

    const inputHandle = await lsDriverGetFileHandleFromAssets(
      ml,
      expect,
      'another_answer_to_the_ultimate_question.txt'
    );

    await project.setBlockArgs(blockId, { inputHandle });

    await project.runBlock(blockId);

    while (true) {
      const state = (await awaitStableState(
        project.getBlockState(blockId),
        25000
      )) as InferBlockState<typeof uploadFileModel>;

      // console.dir(state, { depth: 5 });

      const outputs = state.outputs;
      if (outputs.handle.ok && outputs.handle.value != undefined) {
        expect(outputs.handle.value.isUpload).toBeTruthy();
        expect(outputs.handle.value.done).toBeTruthy();
        return;
      }
    }
  }
);

blockTest(
  'should create read-logs block, render it and read logs from a file',
  async ({ rawPrj: project, ml, helpers, expect }) => {
    const blockId = await project.addBlock('ReadLogs', readLogsSpec);

    const inputHandle = await lsDriverGetFileHandleFromAssets(
      ml,
      expect,
      'maybe_the_number_of_lines_is_the_answer.txt'
    );

    await project.setBlockArgs(blockId, {
      inputHandle,
      // args are from here:
      // https://github.com/milaboratory/sleep/blob/3c046cdcc504b63f1a6e592a4aa87ee773a94d72/read-file-to-stdout-with-sleep.go#L24
      readFileWithSleepArgs: 'PREFIX,100,1000'
    });

    await project.runBlock(blockId);

    while (true) {
      const state = (await awaitStableState(
        project.getBlockState(blockId),
        25000
      )) as InferBlockState<typeof readLogsModel>;

      // console.dir(state, { depth: 5 });
      const outputs = state.outputs;

      if (outputs.lastLogs.ok && outputs.lastLogs.value != undefined) {
        expect((outputs.progressLog as any).value).toContain('PREFIX');
        expect((outputs.progressLog as any).value).toContain('bytes read');
        expect((outputs.lastLogs as any).value.split('\n').length).toEqual(10 + 1); // 11 because the last element is empty
        return;
      }
    }
  },
  // The timeout is higher here because pl - core must download a software for this test.
  { timeout: 20000 }
);

async function lsDriverGetFileHandleFromAssets(
  ml: MiddleLayer,
  expect: any,
  fName: string
): Promise<ImportFileHandle> {
  const storages = await ml.driverKit.lsDriver.getStorageList();

  const local = storages.find((s) => s.name == 'local');
  expect(local).not.toBeUndefined();

  const fileDir = path.resolve(__dirname, '..', '..', '..', 'assets');
  const files = await ml.driverKit.lsDriver.listFiles(local!.handle, fileDir);

  const ourFile = files.entries.find((f) => f.name == fName);
  expect(ourFile).not.toBeUndefined();
  expect(ourFile?.type).toBe('file');

  return (ourFile as any).handle;
}

function outputRef(blockId: string, name: string): PlRef {
  return { __isRef: true, blockId, name };
}
