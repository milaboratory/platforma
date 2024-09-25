import { awaitBlockDone, withMl } from './middle_layer.test';
import { getQuickJS, Scope, shouldInterruptAfterDeadline } from 'quickjs-emscripten';
import * as tp from 'node:timers/promises';

test('test JS render enter numbers', async () => {
  await withMl(async (ml) => {
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    const block1Id = await prj.addBlock('Block 1', {
      type: 'from-registry-v1',
      registryUrl: 'https://block.registry.platforma.bio/releases',
      organization: 'milaboratory',
      package: 'enter-numbers',
      version: '1.1.1'
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
      organization: 'milaboratory',
      package: 'enter-numbers',
      version: '1.1.1'
    });
    await prj.setBlockArgs(block1Id, { numbers: [1, 2, 3] });

    const block2Id = await prj.addBlock('Block 2', {
      type: 'dev',
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
      organization: 'milaboratory',
      package: 'download-file',
      version: '1.2.0'
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
  const state = 10;

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
