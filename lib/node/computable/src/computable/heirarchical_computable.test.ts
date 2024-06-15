import { FakeTreeAccessor, FakeTreeDriver, PersistentFakeTreeNode } from './test_backend';
import { Computable, ComputableRenderingOps } from './computable';

test('simple computable state', async () => {
  const tree1 = new FakeTreeDriver();

  const cs1 = Computable.make(ctx => {
    return ctx.accessor(tree1.accessor).get('a')?.get('b')?.getValue();
  });

  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValue()).toBeUndefined();
  expect(cs1.isChanged()).toBe(false);

  tree1.writer.getOrCreateChild('a');
  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValue()).toBeUndefined();
  expect(cs1.isChanged()).toBe(false);

  tree1.writer.getOrCreateChild('a').getOrCreateChild('b').setValue('ugu');
  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValue()).toEqual('ugu');
  expect(cs1.isChanged()).toBe(false);
});

test('cross tree computable state', async () => {
  const tree1 = new FakeTreeDriver();
  const tree2 = new FakeTreeDriver();

  const cs1 = Computable.make(ctx => {
    const nodeName = ctx.accessor(tree1.accessor).get('a')?.getValue();
    if (nodeName === undefined)
      return undefined;
    return Computable.make(ctx => ctx.accessor(tree2.accessor).get(nodeName)?.getValue());
  });

  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValue()).toBeUndefined();
  expect(cs1.isChanged()).toBe(false);

  tree1.writer.getOrCreateChild('a').setValue('node1');
  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValue()).toBeUndefined();
  expect(cs1.isChanged()).toBe(false);

  tree2.writer.getOrCreateChild('node2');
  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValue()).toBeUndefined();
  expect(cs1.isChanged()).toBe(false);

  tree2.writer.getOrCreateChild('node1').setValue('ugu');
  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValue()).toEqual('ugu');
  expect(cs1.isChanged()).toBe(false);
});

function traverse(
  a: FakeTreeAccessor,
  ...path: string[]): FakeTreeAccessor | undefined {
  let node = a;
  for (const p of path) {
    const next = node.get(p);
    if (next === undefined)
      return undefined;
    node = next;
  }
  return node;
}

function getValueFromTree(tree: FakeTreeDriver,
                          ops: Partial<ComputableRenderingOps> = {},
                          ...path: string[]): Computable<undefined | string> {
  return Computable.make(ctx => {
    return traverse(ctx.accessor(tree.accessor), ...path)?.getValue();
  });
}

function getValueFromTreeAsNested(node: PersistentFakeTreeNode,
                                  ops: Partial<ComputableRenderingOps> = {},
                                  ...pathLeft: string[]): Computable<undefined | string> {
  return Computable.make(ctx => {
    const a = ctx.accessor(node);
    if (pathLeft.length === 0)
      return a.getValue();
    else {
      const next = a.get(pathLeft[0])?.persist;
      if (next === undefined)
        return undefined;
      return getValueFromTreeAsNested(next, {}, ...pathLeft.slice(1));
    }
  }, { key: node.uuid + pathLeft.join('---'), ...ops });
}

function getValueFromTreeAsNestedWithDestroy(tree: PersistentFakeTreeNode,
                                             ops: Partial<ComputableRenderingOps> = {},
                                             tracked: Map<string, number>,
                                             pathLeft: string[], currentPath: string[] = []): Computable<undefined | string> {
  return Computable.make(ctx => {
    const pathString = currentPath.join('/');
    tracked.set(pathString, (tracked.get(pathString) ?? 0) + 1);
    ctx.addOnDestroy(() => {
      const newValue = tracked.get(pathString)! - 1;
      if (newValue === 0)
        tracked.delete(pathString);
      else
        tracked.set(pathString, newValue);
    });
    const a = ctx.accessor(tree);
    if (pathLeft.length === 0)
      return a.getValue();
    else {
      if (!a.isLocked())
        ctx.markUnstable();
      const next = a.get(pathLeft[0])?.persist;
      if (next === undefined)
        return undefined;
      return getValueFromTreeAsNestedWithDestroy(next, {},
        tracked, pathLeft.slice(1), [...currentPath, pathLeft[0]]);
    }
  }, { key: tree.uuid + pathLeft.join('---'), ...ops });
}

test('stability test simple #1', async () => {
  const tree1 = new FakeTreeDriver();

  const cs1 = getValueFromTree(tree1, {}, 'a', 'b');

  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: undefined
  });
  expect(cs1.isChanged()).toBe(false);

  tree1.writer.lock();

  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: true,
    value: undefined
  });
  expect(cs1.isChanged()).toBe(false);
});

test('stability test simple #2', async () => {
  const tree1 = new FakeTreeDriver();

  const cs1 = getValueFromTree(tree1, {}, 'a', 'b');

  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: undefined
  });
  expect(cs1.isChanged()).toBe(false);

  tree1.writer.getOrCreateChild('a');
  tree1.writer.lock();

  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: undefined
  });
  expect(cs1.isChanged()).toBe(false);

  tree1.writer.getOrCreateChild('a').lock();

  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: true,
    value: undefined
  });
  expect(cs1.isChanged()).toBe(false);
});

test('stability test simple #3', async () => {
  const tree1 = new FakeTreeDriver();

  const cs1 = getValueFromTree(tree1, {}, 'a', 'b');

  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: undefined
  });
  expect(cs1.isChanged()).toBe(false);

  tree1.writer.getOrCreateChild('a');
  tree1.writer.lock();

  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: undefined
  });
  expect(cs1.isChanged()).toBe(false);

  tree1.writer.getOrCreateChild('a').getOrCreateChild('b').setValue('ugu');

  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: 'ugu'
  });
  expect(cs1.isChanged()).toBe(false);

  tree1.writer.getOrCreateChild('a').lock().getOrCreateChild('b').lock();

  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: true,
    value: 'ugu'
  });
  expect(cs1.isChanged()).toBe(false);
});

test('on destroy test nested', async () => {
  const tree1 = new FakeTreeDriver();

  const tracked = new Map<string, number>();
  const cs1 = getValueFromTreeAsNestedWithDestroy(
    tree1.accessor, {}, tracked, ['a', 'b']);

  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: undefined
  });
  expect(cs1.isChanged()).toBe(false);
  expect([...tracked.keys()].sort()).toEqual(['']);

  tree1.writer.getOrCreateChild('a');

  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: undefined
  });
  expect(cs1.isChanged()).toBe(false);
  expect([...tracked.keys()].sort()).toEqual(['', 'a']);
  // expect(destroyed).toEqual([]);

  tree1.writer.getOrCreateChild('a').getOrCreateChild('b').setValue('ugu');

  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: 'ugu'
  });
  expect(cs1.isChanged()).toBe(false);
  expect([...tracked.keys()].sort()).toEqual(['', 'a', 'a/b']);

  tree1.writer.deleteChild('a');

  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: undefined
  });
  expect(cs1.isChanged()).toBe(false);
  await new Promise(r => setImmediate(r));
  expect([...tracked.keys()].sort()).toEqual(['']);
});

test('on destroy test nested #2', async () => {
  const tree1 = new FakeTreeDriver();

  const tracked = new Map<string, number>();
  const cs1 = getValueFromTreeAsNestedWithDestroy(
    tree1.accessor, {}, tracked, ['a', 'b']);

  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: undefined
  });
  expect(cs1.isChanged()).toBe(false);
  expect([...tracked.keys()].sort()).toEqual(['']);

  tree1.writer.getOrCreateChild('a').getOrCreateChild('b').setValue('ugu');
  tree1.writer.lock().getOrCreateChild('a').lock().getOrCreateChild('b').lock();

  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: true,
    value: 'ugu'
  });
  expect(cs1.isChanged()).toBe(false);
  expect([...tracked.keys()].sort()).toEqual(['', 'a', 'a/b']);

  tree1.writer.unlock().deleteChild('a');

  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: undefined
  });
  expect(cs1.isChanged()).toBe(false);
  expect([...tracked.keys()].sort()).toEqual(['', 'a', 'a/b']);

  tree1.writer.lock();

  // child destroyed only after result become stable

  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: true,
    value: undefined
  });
  expect(cs1.isChanged()).toBe(false);
  await new Promise(r => setImmediate(r));
  expect([...tracked.keys()].sort()).toEqual(['']);
});

test('on destroy test nested with StableOnlyRetentive', async () => {
  const tree1 = new FakeTreeDriver();

  const tracked = new Map<string, number>();
  const cs1 = getValueFromTreeAsNestedWithDestroy(
    tree1.accessor, { mode: 'StableOnlyRetentive' }, tracked, ['a', 'b']
  );

  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: undefined
  });
  expect(cs1.isChanged()).toBe(false);
  expect([...tracked.keys()].sort()).toEqual(['']);

  tree1.writer.getOrCreateChild('a').getOrCreateChild('b').setValue('ugu');

  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: undefined
  });
  expect(cs1.isChanged()).toBe(false);
  expect([...tracked.keys()].sort()).toEqual(['', 'a', 'a/b']);

  tree1.writer.lock().getOrCreateChild('a').lock().getOrCreateChild('b').lock();

  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: true,
    value: 'ugu'
  });
  expect(cs1.isChanged()).toBe(false);
  expect([...tracked.keys()].sort()).toEqual(['', 'a', 'a/b']);


  tree1.writer.unlock().deleteChild('a');

  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: 'ugu'
  });
  expect(cs1.isChanged()).toBe(false);
  expect([...tracked.keys()].sort()).toEqual(['', 'a', 'a/b']);

  tree1.writer.lock();

  // child destroyed only after result become stable

  expect(cs1.isChanged()).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: true,
    value: undefined
  });
  expect(cs1.isChanged()).toBe(false);
  await new Promise(r => setImmediate(r));
  expect([...tracked.keys()].sort()).toEqual(['']);
});
