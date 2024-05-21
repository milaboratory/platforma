import { FakeTreeAccessor, FakeTreeDriver, PersistentFakeTreeNode } from './test_backend';
import { computable, ExtendedCellRenderingOps } from './computable_helpers';
import { Computable } from './computable';
import { ComputableCtx } from './kernel';

test('simple computable state', async () => {
  const tree1 = new FakeTreeDriver();

  const cs1 = computable(tree1.accessor, {}, (a, ctx) => {
    return a.get('a')?.get('b')?.getValue();
  });

  expect(cs1.changed).toBe(true);
  expect(await cs1.getValue()).toBeUndefined();
  expect(cs1.changed).toBe(false);

  tree1.writer.getOrCreateChild('a');
  expect(cs1.changed).toBe(true);
  expect(await cs1.getValue()).toBeUndefined();
  expect(cs1.changed).toBe(false);

  tree1.writer.getOrCreateChild('a').getOrCreateChild('b').setValue('ugu');
  expect(cs1.changed).toBe(true);
  expect(await cs1.getValue()).toEqual('ugu');
  expect(cs1.changed).toBe(false);
});

test('cross tree computable state', async () => {
  const tree1 = new FakeTreeDriver();
  const tree2 = new FakeTreeDriver();

  const cs1 = computable(tree1.accessor, {}, a1 => {
    const nodeName = a1.get('a')?.getValue();
    if (nodeName === undefined)
      return undefined;
    return computable(tree2.accessor, {}, a2 => a2.get(nodeName)?.getValue());
  });

  expect(cs1.changed).toBe(true);
  expect(await cs1.getValue()).toBeUndefined();
  expect(cs1.changed).toBe(false);

  tree1.writer.getOrCreateChild('a').setValue('node1');
  expect(cs1.changed).toBe(true);
  expect(await cs1.getValue()).toBeUndefined();
  expect(cs1.changed).toBe(false);

  tree2.writer.getOrCreateChild('node2');
  expect(cs1.changed).toBe(true);
  expect(await cs1.getValue()).toBeUndefined();
  expect(cs1.changed).toBe(false);

  tree2.writer.getOrCreateChild('node1').setValue('ugu');
  expect(cs1.changed).toBe(true);
  expect(await cs1.getValue()).toEqual('ugu');
  expect(cs1.changed).toBe(false);
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
                          ops: Partial<ExtendedCellRenderingOps> = {},
                          ...path: string[]): Computable<undefined | string> {
  return computable(tree.accessor, ops, a => {
    return traverse(a, ...path)?.getValue();
  });
}

function getValueFromTreeAsNested(node: PersistentFakeTreeNode,
                                  ops: Partial<ExtendedCellRenderingOps> = {},
                                  ...pathLeft: string[]): Computable<undefined | string> {
  return computable(node, { key: node.uuid + pathLeft.join('---'), ...ops },
    a => {
      if (pathLeft.length === 0)
        return a.getValue();
      else {
        const next = a.get(pathLeft[0])?.persist;
        if (next === undefined)
          return undefined;
        return getValueFromTreeAsNested(next, {}, ...pathLeft.slice(1));
      }
    });
}

function getValueFromTreeAsNestedWithDestroy(tree: PersistentFakeTreeNode,
                                             ops: Partial<ExtendedCellRenderingOps> = {},
                                             onDestroy: (currentPath: string[]) => void,
                                             pathLeft: string[], currentPath: string[] = []): Computable<undefined | string> {
  return computable(tree, { key: tree.uuid + pathLeft.join('---'), ...ops },
    (a, ctx) => {
      if (!ctx.hasOnDestroy)
        ctx.setOnDestroy(() => onDestroy(currentPath));
      if (pathLeft.length === 0)
        return a.getValue();
      else {
        if (!a.isLocked())
          ctx.markUnstable();
        const next = a.get(pathLeft[0])?.persist;
        if (next === undefined)
          return undefined;
        return getValueFromTreeAsNestedWithDestroy(next, {},
          onDestroy, pathLeft.slice(1), [...currentPath, pathLeft[0]]);
      }
    });
}

test('stability test simple #1', async () => {
  const tree1 = new FakeTreeDriver();

  const cs1 = getValueFromTree(tree1, {}, 'a', 'b');

  expect(cs1.changed).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: undefined
  });
  expect(cs1.changed).toBe(false);

  tree1.writer.lock();

  expect(cs1.changed).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: true,
    value: undefined
  });
  expect(cs1.changed).toBe(false);
});

test('stability test simple #2', async () => {
  const tree1 = new FakeTreeDriver();

  const cs1 = getValueFromTree(tree1, {}, 'a', 'b');

  expect(cs1.changed).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: undefined
  });
  expect(cs1.changed).toBe(false);

  tree1.writer.getOrCreateChild('a');
  tree1.writer.lock();

  expect(cs1.changed).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: undefined
  });
  expect(cs1.changed).toBe(false);

  tree1.writer.getOrCreateChild('a').lock();

  expect(cs1.changed).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: true,
    value: undefined
  });
  expect(cs1.changed).toBe(false);
});

test('stability test simple #3', async () => {
  const tree1 = new FakeTreeDriver();

  const cs1 = getValueFromTree(tree1, {}, 'a', 'b');

  expect(cs1.changed).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: undefined
  });
  expect(cs1.changed).toBe(false);

  tree1.writer.getOrCreateChild('a');
  tree1.writer.lock();

  expect(cs1.changed).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: undefined
  });
  expect(cs1.changed).toBe(false);

  tree1.writer.getOrCreateChild('a').getOrCreateChild('b').setValue('ugu');

  expect(cs1.changed).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: 'ugu'
  });
  expect(cs1.changed).toBe(false);

  tree1.writer.getOrCreateChild('a').lock().getOrCreateChild('b').lock();

  expect(cs1.changed).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: true,
    value: 'ugu'
  });
  expect(cs1.changed).toBe(false);
});

test('on destroy test nested', async () => {
  const tree1 = new FakeTreeDriver();

  const destroyed: string[][] = [];
  const cs1 = getValueFromTreeAsNestedWithDestroy(
    tree1.accessor, {}, c => destroyed.push(c), ['a', 'b']);

  expect(cs1.changed).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: undefined
  });
  expect(cs1.changed).toBe(false);
  expect(destroyed).toEqual([]);

  tree1.writer.getOrCreateChild('a');

  expect(cs1.changed).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: undefined
  });
  expect(cs1.changed).toBe(false);
  expect(destroyed).toEqual([]);

  tree1.writer.getOrCreateChild('a').getOrCreateChild('b').setValue('ugu');

  expect(cs1.changed).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: 'ugu'
  });
  expect(cs1.changed).toBe(false);
  expect(destroyed).toEqual([]);

  tree1.writer.deleteChild('a');

  expect(cs1.changed).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: undefined
  });
  expect(cs1.changed).toBe(false);
  await new Promise(r => setImmediate(r));
  expect(destroyed).toEqual([['a', 'b'], ['a']]);
});

test('on destroy test nested #2', async () => {
  const tree1 = new FakeTreeDriver();

  const destroyed: string[][] = [];
  const cs1 = getValueFromTreeAsNestedWithDestroy(
    tree1.accessor, {}, c => destroyed.push(c), ['a', 'b']);

  expect(cs1.changed).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: undefined
  });
  expect(cs1.changed).toBe(false);
  expect(destroyed).toEqual([]);

  tree1.writer.getOrCreateChild('a').getOrCreateChild('b').setValue('ugu');
  tree1.writer.lock().getOrCreateChild('a').lock().getOrCreateChild('b').lock();

  expect(cs1.changed).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: true,
    value: 'ugu'
  });
  expect(cs1.changed).toBe(false);
  expect(destroyed).toEqual([]);

  tree1.writer.unlock().deleteChild('a');

  expect(cs1.changed).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: undefined
  });
  expect(cs1.changed).toBe(false);
  expect(destroyed).toEqual([]);

  tree1.writer.lock();

  // child destroyed only after result become stable

  expect(cs1.changed).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: true,
    value: undefined
  });
  expect(cs1.changed).toBe(false);
  await new Promise(r => setImmediate(r));
  expect(destroyed).toEqual([['a', 'b'], ['a']]);
});

test('on destroy test nested with StableOnlyRetentive', async () => {
  const tree1 = new FakeTreeDriver();

  const destroyed: string[][] = [];
  const cs1 = getValueFromTreeAsNestedWithDestroy(
    tree1.accessor, { mode: 'StableOnlyRetentive' }, c => destroyed.push(c), ['a', 'b']
  );

  expect(cs1.changed).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: undefined
  });
  expect(cs1.changed).toBe(false);
  expect(destroyed).toEqual([]);

  tree1.writer.getOrCreateChild('a').getOrCreateChild('b').setValue('ugu');

  expect(cs1.changed).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: undefined
  });
  expect(cs1.changed).toBe(false);
  expect(destroyed).toEqual([]);

  tree1.writer.lock().getOrCreateChild('a').lock().getOrCreateChild('b').lock();

  expect(cs1.changed).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: true,
    value: 'ugu'
  });
  expect(cs1.changed).toBe(false);
  expect(destroyed).toEqual([]);


  tree1.writer.unlock().deleteChild('a');

  expect(cs1.changed).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: false,
    value: 'ugu'
  });
  expect(cs1.changed).toBe(false);
  expect(destroyed).toEqual([]);

  tree1.writer.lock();

  // child destroyed only after result become stable

  expect(cs1.changed).toBe(true);
  expect(await cs1.getValueOrError()).toMatchObject({
    stable: true,
    value: undefined
  });
  expect(cs1.changed).toBe(false);
  await new Promise(r => setImmediate(r));
  expect(destroyed).toEqual([['a', 'b'], ['a']]);
});
