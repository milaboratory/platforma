import { blockSpec as downloadBlobURLSpec } from '@milaboratories/milaboratories.test-blob-url-custom-protocol';
import type { platforma as downloadBlobURLModel } from '@milaboratories/milaboratories.test-blob-url-custom-protocol.model';
import { blockSpec as downloadFileSpec } from '@milaboratories/milaboratories.test-download-file';
import type { platforma as downloadFileModel } from '@milaboratories/milaboratories.test-download-file.model';
import { blockSpec as enterNumberSpec } from '@milaboratories/milaboratories.test-enter-numbers';
import { blockSpec as readLogsSpec } from '@milaboratories/milaboratories.test-read-logs';
import type { platforma as readLogsModel } from '@milaboratories/milaboratories.test-read-logs.model';
import { blockSpec as sumNumbersSpec } from '@milaboratories/milaboratories.test-sum-numbers';
import { blockSpec as uploadFileSpec } from '@milaboratories/milaboratories.test-upload-file';
import type { platforma as uploadFileModel } from '@milaboratories/milaboratories.test-upload-file.model';
import { blockSpec as transferFilesSpec } from '@milaboratories/milaboratories.transfer-files';
import type { platforma as transferFilesModel } from '@milaboratories/milaboratories.transfer-files.model';
import { type PlClient, DisconnectedError } from '@milaboratories/pl-client';
import {
  type FolderURL,
  type ImportFileHandle,
  type InferBlockState,
  InitialBlockSettings,
  type LocalBlobHandleAndSize,
  type PlRef,
  type Project,
  type RangeBytes,
  type RemoteBlobHandleAndSize,
} from '@milaboratories/pl-middle-layer';
import {
  MiddleLayer,
  TestHelpers,
} from '@milaboratories/pl-middle-layer';
import { awaitStableState, blockTest } from '@platforma-sdk/test';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import { test } from 'vitest';
import { compareBuffersInChunks, computeHashIncremental, shuffleInPlace } from './imports';

export async function withMl(
  cb: (ml: MiddleLayer, workFolder: string) => Promise<void>,
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
      },
    });
    ml.addRuntimeCapability('requiresUIAPIVersion', 1);
    ml.addRuntimeCapability('requiresUIAPIVersion', 2);
    try {
      await cb(ml, workFolder);
    } finally {
      console.log(JSON.stringify(pl.allTxStat));
      await ml.close();
    }
  });
}

export async function withMlAndProxy(
  cb: (ml: MiddleLayer, workFolder: string, proxy: TestHelpers.TestTcpProxy) => Promise<void>,
): Promise<void> {
  const workFolder = path.resolve(`work/${randomUUID()}`);

  await TestHelpers.withTempRoot(async (pl: PlClient, proxy) => {
    const ml = await MiddleLayer.init(pl, workFolder, {
      defaultTreeOptions: { pollingInterval: 250, stopPollingDelay: 500 },
      devBlockUpdateRecheckInterval: 300,
      localSecret: MiddleLayer.generateLocalSecret(),
      localProjections: [], // TODO must be different with local pl
      openFileDialogCallback: () => {
        throw new Error('Not implemented.');
      },
    });
    ml.addRuntimeCapability('requiresUIAPIVersion', 1);
    ml.addRuntimeCapability('requiresUIAPIVersion', 2);
    try {
      await cb(ml, workFolder, proxy);
    } finally {
      console.log(JSON.stringify(pl.allTxStat));
      await ml.close();
    }
  }, { viaTcpProxy: true });
}

export async function awaitBlockDone(prj: Project, blockId: string, timeout: number = 5000) {
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
    } catch (_e: any) {
      console.dir(await state.getValue(), { depth: 5 });
      throw new Error('Aborted.', { cause: _e });
    }
  }
}

test.skip('disconnect:runBlock throws DisconnectedError when connection drops mid-operation', async ({ expect }) => {
  await expect(() => withMlAndProxy(async (ml, _wd, proxy) => {
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    expect(await prj.overview.awaitStableValue()).toMatchObject({
      meta: { label: 'Project 1' },
      blocks: [],
    });

    const block1Id = await prj.addBlock('Block 1', enterNumberSpec);
    const block2Id = await prj.addBlock('Block 2', sumNumbersSpec);

    await prj.setBlockArgs(block1Id, { numbers: [1, 2, 3] });

    await prj.setBlockArgs(block2Id, {
      sources: [outputRef(block1Id, 'numbers')],
    });

    // Start transaction without awaiting, disconnect while in-flight, then await result.
    const result = prj.runBlock(block2Id);

    await proxy.disconnectAll();

    await result;
    await awaitBlockDone(prj, block2Id);
  })).rejects.toThrow(DisconnectedError);
});

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
        opened: false,
      },
    ]);

    await ml.setProjectMeta(pRid1, { label: 'Project 1A' });

    const listSnapshot1 = await projectList.getValue();
    expect(listSnapshot1).toMatchObject([
      {
        id: 'id1',
        rid: pRid1,
        meta: { label: 'Project 1A' },
        opened: false,
      },
    ]);
    expect(listSnapshot1![0].lastModified.valueOf()).toBeGreaterThan(
      listSnapshot1![0].created.valueOf(),
    );

    await ml.openProject(pRid1);

    expect(await projectList.getValue()).toMatchObject([
      {
        id: 'id1',
        rid: pRid1,
        meta: { label: 'Project 1A' },
        opened: true,
      },
    ]);

    await ml.closeProject(pRid1);

    expect(await projectList.getValue()).toMatchObject([
      {
        id: 'id1',
        rid: pRid1,
        meta: { label: 'Project 1A' },
        opened: false,
      },
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
        opened: false,
      },
    ]);

    const lastModInitial = projectListValue1![0].lastModified.valueOf();

    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    expect(await prj.overview.awaitStableValue()).toMatchObject({
      meta: { label: 'Project 1' },
      authorMarker: undefined,
      blocks: [],
    });
    await ml.setProjectMeta(
      pRid1,
      { label: 'New Project Label' },
      { authorId: 'test_author', localVersion: 1 },
    );
    await prj.overview.refreshState();
    expect(await prj.overview.awaitStableValue()).toMatchObject({
      meta: { label: 'New Project Label' },
      authorMarker: { authorId: 'test_author', localVersion: 1 },
      blocks: [],
    });

    const block1Id = await prj.addBlock('Block 1', enterNumberSpec);
    const block2Id = await prj.addBlock('Block 2', enterNumberSpec);
    const block3Id = await prj.addBlock('Block 3', sumNumbersSpec);

    expect(await prj.overview.awaitStableValue()).toMatchObject({
      meta: { label: 'New Project Label' },
      authorMarker: undefined,
    });

    const overviewSnapshot0 = await prj.overview.awaitStableValue();

    overviewSnapshot0.blocks.forEach((block) => {
      expect(block.sections).toBeDefined();
      expect(block.canRun).toEqual(false);
      expect(block.currentBlockPack).toBeDefined();
      expect(block.navigationState).toStrictEqual({ href: '/' });
    });

    const _block1StableState0 = await prj.getBlockState(block1Id).awaitStableValue();
    const _block2StableState0 = await prj.getBlockState(block2Id).awaitStableValue();
    const _block3StableState0 = await prj.getBlockState(block3Id).awaitStableValue();

    expect(_block1StableState0.outputs!['activeArgs']).toStrictEqual({
      ok: true,
      value: undefined,
    });

    await prj.setNavigationState(block1Id, { href: '/section1' });
    await prj.setBlockArgs(block1Id, { numbers: [1, 2, 3] });
    await prj.setBlockArgs(block2Id, { numbers: [3, 4, 5] });
    await prj.setBlockArgs(block3Id, {
      sources: [outputRef(block1Id, 'numbers'), outputRef(block2Id, 'numbers')],
    });
    await prj.runBlock(block3Id);
    await awaitBlockDone(prj, block3Id);
    const overviewSnapshot1 = await prj.overview.awaitStableValue();
    expect(overviewSnapshot1.lastModified.valueOf()).toBeGreaterThan(lastModInitial);

    overviewSnapshot1.blocks.forEach((block) => {
      expect(block.settings).toMatchObject(InitialBlockSettings);
      expect(block.sections).toBeDefined();
      expect(block.outputsError).toBeUndefined();
      expect(block.exportsError).toBeUndefined();
      expect(block.canRun).toEqual(false);
      expect(block.stale).toEqual(false);
      expect(block.currentBlockPack).toBeDefined();
      if (block.id === block1Id) expect(block.navigationState).toStrictEqual({ href: '/section1' });
      else expect(block.navigationState).toStrictEqual({ href: '/' });
    });
    // console.dir(overviewSnapshot1, { depth: 5 });
    const block1StableFrontend = await prj.getBlockFrontend(block1Id).awaitStableValue();
    expect(block1StableFrontend.url).toBeDefined();
    expect(block1StableFrontend.sdkVersion).toBeDefined();
    const block2StableFrontend = await prj.getBlockFrontend(block2Id).awaitStableValue();
    expect(block2StableFrontend.url).toMatch(/enter-numbers/);
    expect(block2StableFrontend.sdkVersion).toBeDefined();
    const block3StableFrontend = await prj.getBlockFrontend(block3Id).awaitStableValue();
    expect(block3StableFrontend.url).toBeDefined();
    expect(block3StableFrontend.sdkVersion).toBeDefined();
    // console.dir({ block1StableFrontend, block2StableFrontend, block3StableFrontend }, { depth: 5 });

    const block1StableState1 = await prj.getBlockState(block1Id).awaitStableValue();
    const _block2StableState1 = await prj.getBlockState(block2Id).awaitStableValue();
    const block3StableState1 = await prj.getBlockState(block3Id).awaitStableValue();
    expect(block1StableState1.navigationState).toStrictEqual({ href: '/section1' });
    expect(_block2StableState1.navigationState).toStrictEqual({ href: '/' });
    expect(block3StableState1.navigationState).toStrictEqual({ href: '/' });
    console.dir(block1StableState1, { depth: 5 });
    console.dir(_block2StableState1, { depth: 5 });
    console.dir(block3StableState1, { depth: 5 });

    expect(block1StableState1.outputs!['activeArgs']).toStrictEqual({
      ok: true,
      value: { numbers: [1, 2, 3] },
    });

    expect(block3StableState1.outputs!['sum']).toStrictEqual({
      ok: true,
      value: 18,
    });

    const overviewSnapshot3 = await prj.overview.awaitStableValue();
    expect(overviewSnapshot3.blocks.find((b) => b.id === block3Id)?.stale).toEqual(false);
    expect(overviewSnapshot3.blocks.find((b) => b.id === block2Id)?.stale).toEqual(false);

    await prj.setBlockArgs(block2Id, { numbers: [3, 4, 5], __ignored_field: 'test' });

    const overviewSnapshot4 = await prj.overview.awaitStableValue();
    expect(overviewSnapshot4.blocks.find((b) => b.id === block3Id)?.stale).toEqual(false);
    expect(overviewSnapshot4.blocks.find((b) => b.id === block2Id)?.stale).toEqual(false);

    await prj.resetBlockArgsAndUiState(block2Id);
    await prj.setBlockSettings(block2Id, { versionLock: 'patch' });

    const block2Inputs = await prj.getBlockState(block2Id).getValue();
    expect(block2Inputs.args).toEqual({ numbers: [] });

    const overviewSnapshot2 = await prj.overview.awaitStableValue();
    expect(overviewSnapshot2.blocks.find((b) => b.id === block3Id)?.canRun).toEqual(false);
    expect(overviewSnapshot2.blocks.find((b) => b.id === block3Id)?.stale).toEqual(true);
    expect(overviewSnapshot2.blocks.find((b) => b.id === block2Id)?.stale).toEqual(true);
    expect(overviewSnapshot2.blocks.find((b) => b.id === block2Id)?.settings).toEqual({
      versionLock: 'patch',
    });
  });
});

test('reorder & rename blocks', { timeout: 20000 }, async ({ expect }) => {
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
      sources: [outputRef(block1Id, 'numbers'), outputRef(block2Id, 'numbers')],
    });
    await prj.runBlock(block3Id);
    await awaitBlockDone(prj, block3Id);

    const overviewSnapshot1 = await prj.overview.awaitStableValue();
    expect(overviewSnapshot1).toMatchObject({
      blocks: [
        { id: block1Id, calculationStatus: 'Done' },
        { id: block2Id, calculationStatus: 'Done' },
        { id: block3Id, calculationStatus: 'Done' },
      ],
    });

    await prj.reorderBlocks([block2Id, block3Id, block1Id]);

    const overviewSnapshot2 = await prj.overview.awaitStableValue();
    expect(overviewSnapshot2).toMatchObject({
      blocks: [
        { id: block2Id, calculationStatus: 'Done' },
        { id: block3Id, calculationStatus: 'Limbo' },
        { id: block1Id, calculationStatus: 'Done' },
      ],
    });
  });
});

test('dependency test', { timeout: 20000 }, async ({ expect }) => {
  await withMl(async (ml) => {
    const projectList = ml.projectList;
    expect(await projectList.awaitStableValue()).toEqual([]);
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');

    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    const block1Id = await prj.addBlock('Block 1', enterNumberSpec);
    const block2Id = await prj.addBlock('Block 2', enterNumberSpec);
    const block3Id = await prj.addBlock('Block 3', sumNumbersSpec);
    const block4Id = await prj.addBlock('Block 4', sumNumbersSpec);
    const block5Id = await prj.addBlock('Block 5', sumNumbersSpec);

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
      sources: [outputRef(block1Id, 'numbers'), outputRef(block2Id, 'numbers')],
    });
    await prj.setBlockArgs(block4Id, {
      sources: [outputRef(block1Id, 'numbers'), outputRef(block2Id, 'numbers')],
    });
    await prj.setBlockArgs(block5Id, {
      sources: [outputRef(block1Id, 'numbers'), outputRef(block2Id, 'numbers')],
    });
    const overviewSnapshot1 = await prj.overview.awaitStableValue();

    expect(overviewSnapshot1.blocks).toMatchObject([
      { upstreams: [], downstreams: [block3Id, block4Id, block5Id] },
      { upstreams: [], downstreams: [block3Id, block4Id, block5Id] },
      { upstreams: [block1Id, block2Id], downstreams: [] },
      { upstreams: [block1Id, block2Id], downstreams: [] },
      { upstreams: [block1Id, block2Id], downstreams: [] },
    ]);

    await prj.setBlockArgs(block3Id, {
      sources: [outputRef(block1Id, 'numbers', true), outputRef(block2Id, 'numbers', true)],
    });
    await prj.setBlockArgs(block4Id, {
      sources: [outputRef(block2Id, 'numbers', true)],
    });
    await prj.setBlockArgs(block5Id, {
      sources: [outputRef(block1Id, 'numbers', true)],
    });
    const overviewSnapshot2 = await prj.overview.awaitStableValue();

    expect(overviewSnapshot2.blocks.map((b) => ({ upstreams: new Set(b.upstreams), downstreams: new Set(b.downstreams) }))).toMatchObject([
      { upstreams: new Set(), downstreams: new Set([block3Id, block5Id]) },
      { upstreams: new Set(), downstreams: new Set([block3Id, block4Id, block5Id]) },
      { upstreams: new Set([block1Id, block2Id]), downstreams: new Set([block5Id]) },
      { upstreams: new Set([block2Id]), downstreams: new Set() },
      { upstreams: new Set([block1Id, block2Id, block3Id]), downstreams: new Set() },
    ]);
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
      sources: [outputRef(block1Id, 'numbers')],
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
      value: 6,
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
      value: 5,
    });

    const overview4 = await prj.overview.awaitStableValue();
    const [overview4Block1, overview4Block2] = overview4.blocks;
    expect(overview4Block1.calculationStatus).toEqual('Done');
    expect(overview4Block2.calculationStatus).toEqual('Done');
  });
});

test('test error propagation', async ({ expect }) => {
  await withMl(async (ml) => {
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    const block1Id = await prj.addBlock('Block 1', enterNumberSpec);

    const overview0 = await prj.overview.awaitStableValue();
    overview0.blocks.forEach((block) => {
      expect(block.sections).toBeDefined();
      expect(block.canRun).toEqual(false);
      expect(block.currentBlockPack).toBeDefined();
    });

    await prj.setBlockArgs(block1Id, { numbers: [1] });

    const block1StableState1 = await prj.getBlockState(block1Id).awaitStableValue();
    expect(block1StableState1.outputs!['errorIfNumberIs999']).toStrictEqual({
      ok: true,
      value: [1],
    });

    await prj.setBlockArgs(block1Id, { numbers: [999] });

    const block1StableState2 = await prj.getBlockState(block1Id).awaitStableValue();

    const result = block1StableState2.outputs!['errorIfNumberIs999'];

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error('Result is ok (unexpected)');
    }

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].name).toBe('WrongResourceTypeError');
  });
});

test('block duplication test', async ({ expect }) => {
  await withMl(async (ml) => {
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    // Create original block with some configuration
    const originalBlockId = await prj.addBlock('Original Block', enterNumberSpec);
    await prj.setBlockArgs(originalBlockId, { numbers: [1, 2, 3] });
    await prj.setUiState(originalBlockId, { testUiState: 'some ui data' });
    await prj.setBlockSettings(originalBlockId, { versionLock: 'patch' });

    // Get initial overview
    const overviewBefore = await prj.overview.awaitStableValue();
    expect(overviewBefore.blocks).toHaveLength(1);
    expect(overviewBefore.blocks[0].label).toBe('Original Block');

    // Duplicate the block
    const duplicatedBlockId = await prj.duplicateBlock(originalBlockId);

    // Verify the duplicated block exists
    const overviewAfter = await prj.overview.awaitStableValue();
    expect(overviewAfter.blocks).toHaveLength(2);

    const originalBlock = overviewAfter.blocks.find((b) => b.id === originalBlockId);
    const duplicatedBlock = overviewAfter.blocks.find((b) => b.id === duplicatedBlockId);

    expect(originalBlock).toBeDefined();
    expect(duplicatedBlock).toBeDefined();

    // Verify block structure is copied
    expect(duplicatedBlock!.label).toBe('Original Block');
    expect(duplicatedBlock!.currentBlockPack).toEqual(originalBlock!.currentBlockPack);
    expect(duplicatedBlock!.settings).toEqual(originalBlock!.settings);

    // Verify block state is copied
    const originalState = await prj.getBlockState(originalBlockId).awaitStableValue();
    const duplicatedState = await prj.getBlockState(duplicatedBlockId).awaitStableValue();

    expect(duplicatedState.args).toEqual(originalState.args);
    expect(duplicatedState.ui).toEqual(originalState.ui);

    // Verify they are independent - changing one shouldn't affect the other
    await prj.setBlockArgs(originalBlockId, { numbers: [4, 5, 6] });

    const originalStateAfter = await prj.getBlockState(originalBlockId).awaitStableValue();
    const duplicatedStateAfter = await prj.getBlockState(duplicatedBlockId).awaitStableValue();

    expect(originalStateAfter.args).toEqual({ numbers: [4, 5, 6] });
    expect(duplicatedStateAfter.args).toEqual({ numbers: [1, 2, 3] }); // unchanged
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
      ' ',
    );

    // await update watcher
    await prj.overview.refreshState();
    const overview1 = await prj.overview.awaitStableValue();
    expect(overview1.blocks[0].updatedBlockPack).toBeDefined();

    await prj.updateBlockPack(block1Id, overview1.blocks[0].updatedBlockPack!);

    const overview2 = await prj.overview.awaitStableValue();
    expect(overview2.blocks[0].currentBlockPack).toStrictEqual(
      overview1.blocks[0].updatedBlockPack,
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
      blocks: [],
    });

    const block3Id = await prj.addBlock('Block 3', sumNumbersSpec);

    await prj.setBlockArgs(block3Id, {
      sources: [], // empty reference list should produce an error
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
    if (!sum.ok) {
      console.log('ml, block error test, the error:');
      console.dir(sum.errors[0], { depth: 150 });
      expect(typeof sum.errors[0] == 'string' ? sum.errors[0] : sum.errors[0].message).toContain(
        'At least 1 data source must be set. It\'s needed in \'block error test\'',
      );
    }
  });
});

blockTest(
  'should create download-file block, render it and gets outputs from its config',
  async ({ rawPrj: project, ml, expect }) => {
    const blockId = await project.addBlock('DownloadFile', downloadFileSpec);

    const inputHandle = await lsDriverGetFileHandleFromAssets(
      ml,
      expect,
      'answer_to_the_ultimate_question.txt',
    );

    await project.setBlockArgs(blockId, { inputHandle });

    await project.runBlock(blockId);

    while (true) {
      const state = (await awaitStableState(
        project.getBlockState(blockId),
        25000,
      )) as InferBlockState<typeof downloadFileModel>;
      // console.dir(state, { depth: 5 });

      const blockFrontend = await project.getBlockFrontend(blockId).awaitStableValue();
      expect(blockFrontend).toBeDefined();
      console.dir(blockFrontend, { depth: 5 });

      const outputs = state.outputs;

      if (outputs.contentAsString.ok) {
        expect(outputs.contentAsString.value).toStrictEqual('42\n');
        expect((outputs.contentAsString1 as any).value).toStrictEqual('42\n42\n');
        expect((outputs.contentAsStringRange as any).value).toStrictEqual('2');
        expect((outputs.contentAsStringRange1 as any).value).toStrictEqual('22');

        expect((outputs.contentAsJson as any).value).toStrictEqual(42);
        const localBlob = (outputs.downloadedBlobContent as any).value as LocalBlobHandleAndSize;
        const remoteBlob = (outputs.onDemandBlobContent as any).value as RemoteBlobHandleAndSize;
        const quickJsRemoteBlob = (outputs.onDemandBlobContent1 as any).value as RemoteBlobHandleAndSize;

        expect(
          Buffer.from(await ml.driverKit.blobDriver.getContent(localBlob.handle)).toString('utf-8'),
        ).toEqual('42\n');

        expect(
          Buffer.from(await ml.driverKit.blobDriver.getContent(remoteBlob.handle)).toString('utf-8'),
        ).toEqual('42\n');

        expect(
          Buffer.from(await ml.driverKit.blobDriver.getContent(remoteBlob.handle, { from: 1, to: 2 })).toString('utf-8'),
        ).toEqual('2');

        expect(
          Buffer.from(await ml.driverKit.blobDriver.getContent(quickJsRemoteBlob.handle, { from: 1, to: 2 })).toString('utf-8'),
        ).toEqual('2');

        return;
      }
    }
  },
);

blockTest(
  'transfer-files concurrent downloads',
  { timeout: 600000 },
  async ({ rawPrj: project, ml, tmpFolder, expect }) => {
    const blockId = await project.addBlock('TransferFiles', transferFilesSpec);

    // Create test files with known content (text and binary)
    const testFiles: Array<{ name: string; buffer: Buffer }> = [
      { name: 'test_small_text.txt', buffer: Buffer.from('Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.') },
      { name: 'test_medium_text.txt', buffer: Buffer.from('Lazy dog jumps over the lazy fox. And the quick brown fox jumps over the lazy dog.') },
      { name: 'test_json.json', buffer: Buffer.from(JSON.stringify({ message: 'Hello from JSON', value: 42 })) },
    ];

    const inputHandles: ImportFileHandle[] = [];
    const originalBuffers: Buffer[] = [];

    // Create temporary files and get their handles
    const storages = await ml.driverKit.lsDriver.getStorageList();
    const local = storages.find((s) => s.name == 'local');
    expect(local).not.toBeUndefined();

    const testDir = path.join(tmpFolder, 'test-files');
    await fsp.mkdir(testDir, { recursive: true });
    console.log('Created test directory:', testDir);

    for (const testFile of testFiles) {
      const filePath = path.join(testDir, testFile.name);
      await fsp.writeFile(filePath, testFile.buffer);
      console.log(`Created test file: ${testFile.name} (${testFile.buffer.length} bytes)`);
      originalBuffers.push(testFile.buffer);

      const files = await ml.driverKit.lsDriver.listFiles(local!.handle, testDir);
      const ourFile = files.entries.find((f) => f.name == testFile.name);
      expect(ourFile).not.toBeUndefined();
      expect(ourFile?.type).toBe('file');

      inputHandles.push((ourFile as any).handle);
    }

    await project.setBlockArgs(blockId, { inputHandles });
    await project.runBlock(blockId);

    async function testChunkedDownload(originalBuffer: Buffer, exportedBlob: RemoteBlobHandleAndSize, chunkSize: number) {
      console.log('  Test: Chunked download with hash verification, chunkSize', chunkSize);

      const totalChunks = Math.ceil(originalBuffer.length / chunkSize);

      console.log(`    - Downloading ${originalBuffer.length} bytes in ${totalChunks} chunks of ${chunkSize} bytes`);

      const downloadedChunks: Buffer[] = [];
      let downloadedBytes = 0;

      const startTime = Date.now();

      const tasks = [] as { chunkIndex: number; range: RangeBytes }[];

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const from = chunkIndex * chunkSize;
        const to = Math.min(from + chunkSize, exportedBlob.size);
        tasks.push({
          chunkIndex,
          range: { from, to },
        });
      }

      shuffleInPlace(tasks);

      const results = await Promise.all(tasks.map(async ({ chunkIndex }) => {
        const from = chunkIndex * chunkSize;
        const to = Math.min(from + chunkSize, exportedBlob.size);
        const expectedChunkSize = to - from;

        const chunk = await ml.driverKit.blobDriver.getContent(exportedBlob.handle, { from, to });
        const chunkBuffer = Buffer.from(chunk);

        // Verify chunk size
        if (chunkBuffer.length !== expectedChunkSize) {
          console.error(`    ❌ Chunk ${chunkIndex}: size mismatch! Expected ${expectedChunkSize}, got ${chunkBuffer.length}`);
          console.error(`       Range: from=${from}, to=${to}`);
        }

        // Verify chunk content against original
        const originalChunk = originalBuffer.subarray(from, to);
        if (!chunkBuffer.equals(originalChunk)) {
          console.error(`    ❌ Chunk ${chunkIndex}: content mismatch!`);
          console.error(`       Range: from=${from}, to=${to}`);
          console.error(`       First 20 bytes of original:   ${originalChunk.subarray(0, 20).toString('hex')}`);
          console.error(`       First 20 bytes of downloaded: ${chunkBuffer.subarray(0, 20).toString('hex')}`);

          // Find first differing byte
          for (let i = 0; i < Math.min(originalChunk.length, chunkBuffer.length); i++) {
            if (originalChunk[i] !== chunkBuffer[i]) {
              console.error(`       First difference at byte ${i}: original=0x${originalChunk[i].toString(16)}, downloaded=0x${chunkBuffer[i].toString(16)}`);
              break;
            }
          }
        }

        // downloadedChunks.push(chunkBuffer);
        downloadedBytes += chunk.length;

        if ((chunkIndex + 1) % 10 === 0 || chunkIndex === totalChunks - 1) {
          const progress = ((downloadedBytes / originalBuffer.length) * 100).toFixed(1);
          console.log(`    - Downloaded ${chunkIndex + 1}/${totalChunks} chunks (${progress}%)`);
        }

        return {
          chunkIndex,
          chunkBuffer,
        };
      }));

      const sortedResults = results.sort((a, b) => a.chunkIndex - b.chunkIndex);

      for (const result of sortedResults) {
        downloadedChunks.push(result.chunkBuffer);
      }

      const downloadTime = Date.now() - startTime;
      const downloadSpeed = (downloadedBytes / 1024 / 1024 / (downloadTime / 1000)).toFixed(2);
      console.log(`    - Download completed in ${downloadTime}ms (${downloadSpeed} MB/s)`);

      // Concatenate all chunks
      console.log('    - Concatenating chunks...');
      const downloadedBuffer = Buffer.concat(downloadedChunks);

      // Verify size
      expect(downloadedBuffer.length).toBe(originalBuffer.length);
      console.log(`    ✓ Downloaded size matches: ${downloadedBuffer.length} bytes`);

      // Compute hashes
      console.log('    - Computing hashes...');
      const originalHash = computeHashIncremental(originalBuffer);
      const downloadedHash = computeHashIncremental(downloadedBuffer);

      console.log(`    - Original hash:    ${originalHash}`);
      console.log(`    - Downloaded hash:  ${downloadedHash}`);

      // Verify hashes match
      expect(downloadedHash).toBe(originalHash);
      console.log('    ✓ Hashes match - data integrity verified!');

      // Additional verification: compare buffers in chunks
      console.log('    - Comparing buffers in chunks...');
      const buffersMatch = compareBuffersInChunks(originalBuffer, downloadedBuffer);
      expect(buffersMatch).toBe(true);
      console.log('    ✓ Chunk-by-chunk comparison passed!');

      console.log('  ✓ Chunked download test passed');
    }

    while (true) {
      const state = (await awaitStableState(
        project.getBlockState(blockId),
        25000,
      )) as InferBlockState<typeof transferFilesModel>;

      const blockFrontend = await project.getBlockFrontend(blockId).awaitStableValue();
      expect(blockFrontend).toBeDefined();

      const outputs = state.outputs;

      if (outputs.fileImports.ok && outputs.fileExports.ok) {
        const fileImports = outputs.fileImports.value;
        const fileExports = outputs.fileExports.value as Record<ImportFileHandle, RemoteBlobHandleAndSize>;

        console.log('\n=== File Transfer Results ===');
        console.log(`Files imported: ${Object.keys(fileImports).length}`);
        console.log(`Files exported: ${Object.keys(fileExports).length}`);

        // Verify all files were imported
        expect(Object.keys(fileImports).length).toBe(testFiles.length);
        expect(Object.keys(fileExports).length).toBe(testFiles.length);

        // Test each file with comprehensive range testing
        await Promise.all(testFiles.map(async (testFile, i) => {
          const handle = inputHandles[i];
          const originalBuffer = originalBuffers[i];

          console.log(`\n--- Testing ${testFile.name} (${originalBuffer.length} bytes) ---`);

          // Check import progress
          const importProgress = fileImports[handle];
          expect(importProgress).toBeDefined();
          expect(importProgress.done).toBe(true);

          // Check exported blob
          const exportedBlob = fileExports[handle];
          expect(exportedBlob).toBeDefined();
          expect(exportedBlob).toHaveProperty('handle');
          expect(exportedBlob).toHaveProperty('size');
          expect(exportedBlob.size).toBe(originalBuffer.length);

          await Promise.all([
            testChunkedDownload(originalBuffer, exportedBlob, 13),
            testChunkedDownload(originalBuffer, exportedBlob, 5),
            testChunkedDownload(originalBuffer, exportedBlob, 20),
            testChunkedDownload(originalBuffer, exportedBlob, 1),
            testChunkedDownload(originalBuffer, exportedBlob, 2),
          ]);

          console.log(`✅ All tests passed for ${testFile.name}`);
        }));

        console.log('\n=== All transfer-files tests completed successfully ===');
        await new Promise((resolve) => setTimeout(resolve, 1000));

        return;
      }
    }
  },
);

blockTest(
  'transfer-files big files',
  { timeout: 600000 },
  async ({ rawPrj: project, ml, tmpFolder, expect }) => {
    const blockId = await project.addBlock('TransferFiles', transferFilesSpec);

    // Helper function to create random buffer
    const createRandomBuffer = (size: number): Buffer => {
      const buffer = Buffer.alloc(size);
      for (let i = 0; i < size; i++) {
        buffer[i] = Math.floor(Math.random() * 256);
      }
      return buffer;
    };

    // Helper function to compute hash incrementally for large buffers
    const computeHashIncremental = (buffer: Buffer): string => {
      const hasher = createHash('sha256');
      const chunkSize = 64 * 1024 * 1024; // 64 MB chunks
      for (let offset = 0; offset < buffer.length; offset += chunkSize) {
        const end = Math.min(offset + chunkSize, buffer.length);
        hasher.update(buffer.subarray(offset, end));
      }
      return hasher.digest('hex');
    };

    // Helper function to compare buffers in chunks
    const compareBuffersInChunks = (buffer1: Buffer, buffer2: Buffer): boolean => {
      if (buffer1.length !== buffer2.length) return false;

      const chunkSize = 64 * 1024 * 1024; // 64 MB chunks
      const totalChunks = Math.ceil(buffer1.length / chunkSize);
      let chunksCompared = 0;

      for (let offset = 0; offset < buffer1.length; offset += chunkSize) {
        const end = Math.min(offset + chunkSize, buffer1.length);
        const chunk1 = buffer1.subarray(offset, end);
        const chunk2 = buffer2.subarray(offset, end);

        if (!chunk1.equals(chunk2)) return false;

        chunksCompared++;
        if (chunksCompared % 20 === 0 || chunksCompared === totalChunks) {
          const progress = ((chunksCompared / totalChunks) * 100).toFixed(1);
          console.log(`    - Compared ${chunksCompared}/${totalChunks} chunks (${progress}%)`);
        }
      }

      return true;
    };

    // Create test files with known content (text and binary)
    const testFiles: Array<{ name: string; buffer: Buffer }> = [
      // Huge binary file (1 GiB) - to test size limits
      { name: 'test_huge_binary.bin', buffer: createRandomBuffer(33 * 1024 * 1024 + 1) },
      { name: 'test_huge_binary_2.bin', buffer: createRandomBuffer(33 * 1024 * 1024 + 2) },
      { name: 'test_huge_binary_3.bin', buffer: createRandomBuffer(33 * 1024 * 1024 + 3) },
      { name: 'test_huge_binary_4.bin', buffer: createRandomBuffer(33 * 1024 * 1024 + 4) },
      { name: 'test_huge_binary_5.bin', buffer: createRandomBuffer(33 * 1024 * 1024 + 5) },
      { name: 'test_huge_binary_6.bin', buffer: createRandomBuffer(33 * 1024 * 1024 + 6) },
      { name: 'test_huge_binary_7.bin', buffer: createRandomBuffer(33 * 1024 * 1024 + 7) },
      { name: 'test_huge_binary_8.bin', buffer: createRandomBuffer(33 * 1024 * 1024 + 8) },
      { name: 'test_huge_binary_9.bin', buffer: createRandomBuffer(33 * 1024 * 1024 + 9) },
      { name: 'test_huge_binary_10.bin', buffer: createRandomBuffer(33 * 1024 * 1024 + 10) },
    ];

    const inputHandles: ImportFileHandle[] = [];
    const originalBuffers: Buffer[] = [];

    // Create temporary files and get their handles
    const storages = await ml.driverKit.lsDriver.getStorageList();
    const local = storages.find((s) => s.name == 'local');
    expect(local).not.toBeUndefined();

    const testDir = path.join(tmpFolder, 'test-files');
    await fsp.mkdir(testDir, { recursive: true });
    console.log('Created test directory:', testDir);

    for (const testFile of testFiles) {
      const filePath = path.join(testDir, testFile.name);
      await fsp.writeFile(filePath, testFile.buffer);
      console.log(`Created test file: ${testFile.name} (${testFile.buffer.length} bytes)`);
      originalBuffers.push(testFile.buffer);

      const files = await ml.driverKit.lsDriver.listFiles(local!.handle, testDir);
      const ourFile = files.entries.find((f) => f.name == testFile.name);
      expect(ourFile).not.toBeUndefined();
      expect(ourFile?.type).toBe('file');

      inputHandles.push((ourFile as any).handle);
    }

    await project.setBlockArgs(blockId, { inputHandles });
    await project.runBlock(blockId);

    while (true) {
      const state = (await awaitStableState(
        project.getBlockState(blockId),
        25000,
      )) as InferBlockState<typeof transferFilesModel>;

      const blockFrontend = await project.getBlockFrontend(blockId).awaitStableValue();
      expect(blockFrontend).toBeDefined();

      const outputs = state.outputs;

      if (outputs.fileImports.ok && outputs.fileExports.ok) {
        const fileImports = outputs.fileImports.value;
        const fileExports = outputs.fileExports.value as Record<ImportFileHandle, RemoteBlobHandleAndSize>;

        console.log('\n=== File Transfer Results ===');
        console.log(`Files imported: ${Object.keys(fileImports).length}`);
        console.log(`Files exported: ${Object.keys(fileExports).length}`);

        expect(Object.keys(fileImports).length).toBe(testFiles.length);
        expect(Object.keys(fileExports).length).toBe(testFiles.length);

        await Promise.allSettled(testFiles.map(async (testFile, i) => {
          const handle = inputHandles[i];
          const originalBuffer = originalBuffers[i];

          console.log(`\n--- Testing ${testFile.name} (${originalBuffer.length} bytes) ---`);

          const importProgress = fileImports[handle];
          expect(importProgress).toBeDefined();
          expect(importProgress.done).toBe(true);

          const exportedBlob = fileExports[handle];
          expect(exportedBlob).toBeDefined();
          expect(exportedBlob).toHaveProperty('handle');
          expect(exportedBlob).toHaveProperty('size');
          expect(exportedBlob.size).toBe(originalBuffer.length);

          {
            console.log('Chunked download with hash verification');

            const chunkSize = 1024 * 1024; // 1 MiB chunks
            const totalChunks = Math.ceil(originalBuffer.length / chunkSize);

            console.log(`    - Downloading ${originalBuffer.length} bytes in ${totalChunks} chunks of ${chunkSize} bytes`);

            const downloadedChunks: Buffer[] = [];
            let downloadedBytes = 0;

            const startTime = Date.now();

            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
              const from = chunkIndex * chunkSize;
              const to = Math.min(from + chunkSize, exportedBlob.size);
              const expectedChunkSize = to - from;

              const chunk = await ml.driverKit.blobDriver.getContent(exportedBlob.handle, { from, to });
              const chunkBuffer = Buffer.from(chunk);

              // Verify chunk size
              if (chunkBuffer.length !== expectedChunkSize) {
                console.error(`    ❌ Chunk ${chunkIndex}: size mismatch! Expected ${expectedChunkSize}, got ${chunkBuffer.length}`);
                console.error(`       Range: from=${from}, to=${to}`);
              }

              // Verify chunk content against original
              const originalChunk = originalBuffer.subarray(from, to);
              if (!chunkBuffer.equals(originalChunk)) {
                console.error(`    ❌ Chunk ${chunkIndex}: content mismatch!`);
                console.error(`       Range: from=${from}, to=${to}`);
                console.error(`       First 20 bytes of original:   ${originalChunk.subarray(0, 20).toString('hex')}`);
                console.error(`       First 20 bytes of downloaded: ${chunkBuffer.subarray(0, 20).toString('hex')}`);

                // Find first differing byte
                for (let i = 0; i < Math.min(originalChunk.length, chunkBuffer.length); i++) {
                  if (originalChunk[i] !== chunkBuffer[i]) {
                    console.error(`       First difference at byte ${i}: original=0x${originalChunk[i].toString(16)}, downloaded=0x${chunkBuffer[i].toString(16)}`);
                    break;
                  }
                }
              }

              downloadedChunks.push(chunkBuffer);
              downloadedBytes += chunk.length;

              if ((chunkIndex + 1) % 10 === 0 || chunkIndex === totalChunks - 1) {
                const progress = ((downloadedBytes / originalBuffer.length) * 100).toFixed(1);
                console.log(`    - Downloaded ${chunkIndex + 1}/${totalChunks} chunks (${progress}%)`);
              }
            }

            const downloadTime = Date.now() - startTime;
            const downloadSpeed = (downloadedBytes / 1024 / 1024 / (downloadTime / 1000)).toFixed(2);
            console.log(`    - Download completed in ${downloadTime}ms (${downloadSpeed} MB/s)`);

            // Concatenate all chunks
            console.log('    - Concatenating chunks...');
            const downloadedBuffer = Buffer.concat(downloadedChunks);

            // Verify size
            expect(downloadedBuffer.length).toBe(originalBuffer.length);
            console.log(`    ✓ Downloaded size matches: ${downloadedBuffer.length} bytes`);

            // Compute hashes
            console.log('    - Computing hashes...');
            const originalHash = computeHashIncremental(originalBuffer);
            const downloadedHash = computeHashIncremental(downloadedBuffer);

            console.log(`    - Original hash:    ${originalHash}`);
            console.log(`    - Downloaded hash:  ${downloadedHash}`);

            // Verify hashes match
            expect(downloadedHash).toBe(originalHash);
            console.log('    ✓ Hashes match - data integrity verified!');

            // Additional verification: compare buffers in chunks
            console.log('    - Comparing buffers in chunks...');
            const buffersMatch = compareBuffersInChunks(originalBuffer, downloadedBuffer);
            expect(buffersMatch).toBe(true);
            console.log('    ✓ Chunk-by-chunk comparison passed!');

            console.log('  ✓ Chunked download test passed');
          }

          console.log(`✅ All tests passed for ${testFile.name}`);
        }));

        console.log('\n=== All transfer-files tests completed successfully ===');
        await new Promise((resolve) => setTimeout(resolve, 1000));

        return;
      }
    }
  },
);

blockTest(
  'should create blob-url-custom-protocol block, render it and gets outputs from its config',
  { timeout: 30000 },
  async ({ rawPrj: project, ml, expect }) => {
    const blockId = await project.addBlock('DownloadBlobUrl', downloadBlobURLSpec);

    const inputTgzHandle = await lsDriverGetFileHandleFromAssets(ml, expect, 'funny_cats_site.tar.gz');
    const inputZipHandle = await lsDriverGetFileHandleFromAssets(ml, expect, 'funny_cats_site.zip');

    await project.setBlockArgs(blockId, { inputTgzHandle, inputZipHandle });

    await project.runBlock(blockId);

    while (true) {
      const state = (await awaitStableState(
        project.getBlockState(blockId),
        13000,
      )) as InferBlockState<typeof downloadBlobURLModel>;
      // console.dir(state, { depth: 5 });

      const blockFrontend = await project.getBlockFrontend(blockId).awaitStableValue();
      expect(blockFrontend).toBeDefined();
      console.dir(blockFrontend, { depth: 5 });

      const outputs = state.outputs;

      if (outputs.tgz_content.ok) {
        const url = outputs.tgz_content.value;
        expect(url).not.toBeUndefined();
        console.dir(ml.internalDriverKit.blobToURLDriver.info(), { depth: 150 });

        const defaultUrl = ml.internalDriverKit.blobToURLDriver.getPathForCustomProtocol(url);
        expect(defaultUrl).matches(/.*index.html$/);

        const styles = ml.internalDriverKit.blobToURLDriver.getPathForCustomProtocol((url + '/styles.css') as FolderURL);

        expect(styles).matches(/.*\/styles.css/);

        return;
      }
    }
  },
);

blockTest(
  'should create upload-file block, render it and upload a file to pl server',
  async ({ rawPrj: project, ml, expect }) => {
    const blockId = await project.addBlock('UpdateFile', uploadFileSpec);

    const inputHandle = await lsDriverGetFileHandleFromAssets(
      ml,
      expect,
      'another_answer_to_the_ultimate_question.txt',
    );

    await project.setBlockArgs(blockId, { inputHandle });

    await project.runBlock(blockId);

    while (true) {
      const state = (await awaitStableState(
        project.getBlockState(blockId),
        25000,
      )) as InferBlockState<typeof uploadFileModel>;

      // console.dir(state, { depth: 5 });

      const outputs = state.outputs;
      if (outputs.handle.ok && outputs.handle.value != undefined) {
        expect(outputs.handle.value.isUpload).toBeTruthy();
        expect(outputs.handle.value.done).toBeTruthy();
        return;
      }
    }
  },
);

blockTest(
  'should create read-logs block, render it and read logs from a file',
  // The timeout is higher here because pl - core must download a software for this test.
  { timeout: 20000 },
  async ({ rawPrj: project, ml, helpers: _helpers, expect }) => {
    const blockId = await project.addBlock('ReadLogs', readLogsSpec);

    const inputHandle = await lsDriverGetFileHandleFromAssets(
      ml,
      expect,
      'maybe_the_number_of_lines_is_the_answer.txt',
    );

    await project.setBlockArgs(blockId, {
      inputHandle,
      // args are from here:
      // https://github.com/milaboratory/sleep/blob/3c046cdcc504b63f1a6e592a4aa87ee773a94d72/read-file-to-stdout-with-sleep.go#L24
      readFileWithSleepArgs: 'PREFIX,100,1000',
    });

    await project.runBlock(blockId);

    while (true) {
      const state = (await awaitStableState(
        project.getBlockState(blockId),
        25000,
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
);

async function lsDriverGetFileHandleFromAssets(
  ml: MiddleLayer,
  expect: any,
  fName: string,
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

/*
async function getImportFileHandleFromTmp(
  ml: MiddleLayer,
  fName: string,
  fileSize: number,
): Promise<ImportFileHandle> {
  const storages = await ml.driverKit.lsDriver.getStorageList();

  const local = storages.find((s) => s.name == 'local');

  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'tmp-'));
  const filePath = path.join(tmpDir, fName);

  console.log('filePath', filePath);

  const buffer = Buffer.alloc(fileSize, 0);
  fs.writeFileSync(filePath, buffer);

  const files = await ml.driverKit.lsDriver.listFiles(local!.handle, tmpDir);

  const ourFile = files.entries.find((f) => f.name == fName);

  return (ourFile as any).handle;
}
*/

function outputRef(blockId: string, name: string, requireEnrichments?: true): PlRef {
  return { __isRef: true, blockId, name, requireEnrichments };
}
