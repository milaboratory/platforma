import { awaitBlockDone, withMl } from './middle_layer.test';
import { getQuickJS, Scope } from 'quickjs-emscripten';

test('test render', async () => {
  await withMl(async ml => {
    const pRid1 = await ml.createProject({ label: 'Project 1' }, 'id1');
    await ml.openProject(pRid1);
    const prj = ml.getOpenedProject(pRid1);

    const block1Id = await prj.addBlock('Block 1', {
      type: 'dev',
      folder: '/Volumes/Data/Projects/MiLaboratory/blocks-beta/block-beta-enter-numbers'
    });

    await prj.setBlockArgs(block1Id, { numbers: [1, 2, 3] });
    await prj.runBlock(block1Id);
    await awaitBlockDone(prj, block1Id);

    console.dir(await prj.getBlockState(block1Id).getValue(), { depth: 5 });
  });
});

test('basic quickjs code', async () => {
  const qJs = await getQuickJS();
  let state = 10;

  const start = Date.now();
  const n = 1000;
  for (let i = 0; i < n; ++i) {
    Scope.withScope((scope) => {
      const rt = scope.manage(qJs.newRuntime());
      rt.setMemoryLimit(1024 * 640);
      rt.setMaxStackSize(1024 * 320);
      const vm = scope.manage(rt.newContext());
      vm.newFunction('nextId', () => {
        return vm.newNumber(++state);
      }).consume(fn => vm.setProp(vm.global, 'nextId', fn));
      const nextId = scope.manage(vm.unwrapResult(vm.evalCode(`nextId(); nextId(); nextId()`)));
    });
  }
  console.log(`${Date.now() - start}us per iteration`);
});
