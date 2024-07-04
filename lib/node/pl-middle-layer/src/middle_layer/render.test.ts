import { awaitBlockDone, withMl } from './middle_layer.test';
import { getQuickJS, Scope, shouldInterruptAfterDeadline } from 'quickjs-emscripten';
import * as tp from 'node:timers/promises';

test('test render', async () => {
  await withMl(async ml => {
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    const block1Id = await prj.addBlock('Block 1', {
      type: 'dev',
      // folder: '/Volumes/Data/Projects/MiLaboratory/blocks-beta/block-beta-enter-numbers'
      folder: '/Volumes/Data/Projects/MiLaboratory/blocks-beta/block-beta-download-file'
    });

    // await prj.setBlockArgs(block1Id, { numbers: [1, 2, 3] });
    await prj.setBlockArgs(block1Id, {
      storageId: 'library',
      filePath: 'answer_to_the_ultimate_question.txt'
    });
    await prj.runBlock(block1Id);
    await awaitBlockDone(prj, block1Id);
    // await prj.getBlockState(block1Id).awaitStableValue();
    for (let i = 0; i < 4; ++i) {
      console.dir(await prj.getBlockState(block1Id).getValue(), { depth: 5 });
      await tp.setTimeout(100);
    }
  });
});

test('basic quickjs code', async () => {
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
      }).consume(fn => vm.setProp(vm.global, 'nextId', fn));
      console.log('asdasdas');

      const nextId = vm.getString(scope.manage(vm.unwrapResult(vm.evalCode(`nextId(); nextId(); i = 0; while (1) { i++ } /* Buffer.from(nextId()); */`))));
      console.log(`${nextId}us per iteration`);

    });
  } catch (e: any) {
    console.log(e);
  }
  // }
  console.log(`${Date.now() - start}us per iteration`);
});
