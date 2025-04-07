import { expect, test } from 'vitest';
import * as tp from 'node:timers/promises';
import path from 'path';
import { getQuickJS, Scope, shouldInterruptAfterDeadline } from 'quickjs-emscripten';
import { randomUUID } from 'node:crypto';
import { MiddleLayer } from './middle_layer';
import { PlClient, TestHelpers } from '@milaboratories/pl-client';
import { Project } from './project';

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

test('test JS render enter numbers', async () => {
  await withMl(async (ml) => {
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    const block1Id = await prj.addBlock('Block 1', {
      type: 'from-registry-v1',
      registryUrl: 'https://block.registry.platforma.bio/releases',
      id: { organization: 'milaboratory', name: 'enter-numbers', version: '1.1.1' }
    });

    await prj.setBlockArgs(block1Id, { numbers: [1, 2, 3] });
    await prj.runBlock(block1Id);
    await awaitBlockDone(prj, block1Id);
    const blockState = prj.getBlockState(block1Id);
    await blockState.awaitStableValue();
    const stateSnapshot = await blockState.getValue();
    expect((stateSnapshot.outputs!['dependsOnBlocks1'] as any).value.length).toBeGreaterThan(5);
  });
});

test.skip('test JS render options', async () => {
  await withMl(async (ml) => {
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    const block1Id = await prj.addBlock('Block 1', {
      type: 'from-registry-v1',
      registryUrl: 'https://block.registry.platforma.bio/releases',
      id: { organization: 'milaboratory', name: 'enter-numbers', version: '1.1.1' }
    });
    await prj.setBlockArgs(block1Id, { numbers: [1, 2, 3] });

    const block2Id = await prj.addBlock('Block 2', {
      type: 'dev-v1',
      folder: '../../blocks-beta/block-beta-sum-numbers'
    });

    const block2State = prj.getBlockState(block2Id);

    await tp.setTimeout(2000);
    const block2StateSnapshot1 = await block2State.getValue();
    console.dir(block2StateSnapshot1, { depth: 7 });

    // expect((stateSnapshot.outputs!['contentAsString1'] as any).value.length).toBeGreaterThan(5);

    // await prj.runBlock(block1Id);
    // await awaitBlockDone(prj, block1Id);
    // const blockState = prj.getBlockState(block1Id);
    // await blockState.awaitStableValue();
    // const stateSnapshot = await blockState.getValue();
    // console.dir(stateSnapshot, { depth: 5 });
    // expect((stateSnapshot.outputs!['contentAsString1'] as any).value.length).toBeGreaterThan(5);
  });
});

test.skip('test JS render download', async () => {
  await withMl(async (ml) => {
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    const block1Id = await prj.addBlock('Block 1', {
      type: 'from-registry-v1',
      registryUrl: 'https://block.registry.platforma.bio/releases',
      id: { organization: 'milaboratory', name: 'download-file', version: '1.2.0' }
    });

    await prj.setBlockArgs(block1Id, {
      storageId: 'library',
      filePath: 'answer_to_the_ultimate_question.txt'
    });

    await prj.runBlock(block1Id);
    await awaitBlockDone(prj, block1Id);
    const blockState = prj.getBlockState(block1Id);
    await blockState.awaitStableValue();
    const stateSnapshot = await blockState.getValue();
    console.dir(stateSnapshot, { depth: 5 });
    expect((stateSnapshot.outputs!['contentAsString1'] as any).value.length).toBeGreaterThan(5);
  });
});

test.skip('basic quickjs code', async () => {
  const qJs = await getQuickJS();
  let state = 10;

  const start = Date.now();
  // const n = 1000;
  // for (let i = 0; i < n; ++i) {
  try {
    Scope.withScope((scope) => {
      const rt = scope.manage(qJs.newRuntime());
      rt.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + 100));
      rt.setMemoryLimit(1024 * 640);
      rt.setMaxStackSize(1024 * 320);
      const vm = scope.manage(rt.newContext({ intrinsics: { TypedArrays: false } }));
      vm.newFunction('nextId', () => {
        return vm.newNumber(12); // vm.newArrayBuffer(new Uint8Array([1, 2]));
      }).consume((fn) => vm.setProp(vm.global, 'nextId', fn));
      console.log('asdasdas');

      const nextId = vm.getString(
        scope.manage(
          vm.unwrapResult(
            vm.evalCode(`nextId(); nextId(); i = 0; while (1) { i++ } /* Buffer.from(nextId()); */`)
          )
        )
      );
      console.log(`${nextId}us per iteration`);
    });
  } catch (e: any) {
    console.log(e);
  }
  // }
  console.log(`${Date.now() - start}us per iteration`);
});
