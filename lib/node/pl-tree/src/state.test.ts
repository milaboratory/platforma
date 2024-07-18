import { isPlTreeEntry, isPlTreeEntryAccessor, isPlTreeNodeAccessor } from './accessors';
import { PlTreeState } from './state';
import {
  dField,
  iField,
  ResourceReady,
  TestDynamicRootId1,
  TestDynamicRootState1,
  TestStructuralResourceState1,
  TestValueResourceState1,
  TestErrorResourceState2
} from './test_utils';
import { Computable } from '@milaboratory/computable';
import { NullResourceId, ResourceId } from '@milaboratory/pl-client-v2';

function rid(id: bigint): ResourceId {
  return id as ResourceId;
}

test('simple tree test 1', async () => {
  const tree = new PlTreeState(TestDynamicRootId1);
  const entry = tree.entry();
  expect(isPlTreeEntry(entry)).toStrictEqual(true);
  const c1 = Computable.make((c) => {
    const eAcc = c.accessor(entry);
    expect(isPlTreeEntryAccessor(eAcc)).toStrictEqual(true);
    const nAcc = eAcc.node();
    expect(isPlTreeNodeAccessor(nAcc)).toStrictEqual(true);
    return nAcc.traverse('a', 'b')?.getDataAsString();
  });

  expect(c1.isChanged()).toBeTruthy();
  await expect(async () => await c1.getValue()).rejects.toThrow(/not found/);
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([{ ...TestDynamicRootState1, fields: [] }]);
  expect(c1.isChanged()).toBeTruthy();
  expect(await c1.getValue()).toBeUndefined();
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([{ ...TestDynamicRootState1, fields: [dField('b')] }]);
  expect(c1.isChanged()).toBeTruthy();
  expect(await c1.getValue()).toBeUndefined();
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([{ ...TestDynamicRootState1, fields: [dField('b'), dField('a')] }]);
  expect(c1.isChanged()).toBeTruthy();
  expect(await c1.getValue()).toBeUndefined();
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([
    { ...TestDynamicRootState1, fields: [dField('b'), dField('a', rid(rid(1n)))] },
    { ...TestStructuralResourceState1, id: rid(rid(1n)), fields: [iField('b', rid(rid(2n)))] },
    {
      ...TestValueResourceState1,
      id: rid(rid(2n)),
      data: new TextEncoder().encode('Test1')
    }
  ]);
  expect(c1.isChanged()).toBeTruthy();
  expect(await c1.getValue()).toStrictEqual('Test1');
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([{ ...TestDynamicRootState1, fields: [dField('a')] }]);
  expect(c1.isChanged()).toBeTruthy();
  expect(await c1.getValue()).toBeUndefined();
  expect(c1.isChanged()).toBeFalsy();
});

test('simple tree kv test', async () => {
  const tree = new PlTreeState(TestDynamicRootId1);
  const c1 = Computable.make((c) =>
    c.accessor(tree.entry()).node().traverse('a', 'b')?.getKeyValueAsString('thekey')
  );

  expect(JSON.stringify(tree.entry())).toMatch(/^"\[ENTRY:/);

  expect(c1.isChanged()).toBeTruthy();
  await expect(async () => await c1.getValue()).rejects.toThrow(/not found/);
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([
    { ...TestDynamicRootState1, fields: [dField('b'), dField('a', rid(rid(1n)))] },
    { ...TestStructuralResourceState1, id: rid(rid(1n)), fields: [iField('b', rid(rid(2n)))] },
    {
      ...TestValueResourceState1,
      id: rid(rid(2n)),
      data: new TextEncoder().encode('Test1')
    }
  ]);

  expect(c1.isChanged()).toBeTruthy();
  expect(await c1.getValue()).toBeUndefined();
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([
    {
      ...TestValueResourceState1,
      id: rid(rid(2n)),
      data: new TextEncoder().encode('Test1'),
      kv: [{ key: 'thekey', value: Buffer.from('thevalue') }]
    }
  ]);

  expect(c1.isChanged()).toBeTruthy();
  expect(await c1.getValue()).toEqual('thevalue');
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([
    {
      ...TestValueResourceState1,
      id: rid(rid(2n)),
      data: new TextEncoder().encode('Test1'),
      kv: []
    }
  ]);

  expect(c1.isChanged()).toBeTruthy();
  expect(await c1.getValue()).toBeUndefined();
  expect(c1.isChanged()).toBeFalsy();
});

test('partial tree update', async () => {
  const tree = new PlTreeState(TestDynamicRootId1);
  const c1 = Computable.make((c) =>
    c
      .accessor(tree.entry())
      .node()
      .traverse(
        { field: 'a', assertFieldType: 'Dynamic' },
        { field: 'b', assertFieldType: 'Dynamic' }
      )
      ?.getDataAsString()
  );

  expect(c1.isChanged()).toBeTruthy();
  await expect(async () => await c1.getValue()).rejects.toThrow(/not found/);
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([
    { ...TestDynamicRootState1, fields: [dField('b'), dField('a', rid(1n))] },
    { ...TestStructuralResourceState1, id: rid(1n), fields: [dField('b', rid(2n))] },
    {
      ...TestValueResourceState1,
      id: rid(2n),
      data: new TextEncoder().encode('Test1')
    }
  ]);
  expect(c1.isChanged()).toBeTruthy();
  expect(await c1.getValue()).toStrictEqual('Test1');
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([{ ...TestStructuralResourceState1, id: rid(1n), fields: [] }]);
  expect(c1.isChanged()).toBeTruthy();
  expect(await c1.getValue()).toBeUndefined();
  expect(c1.isChanged()).toBeFalsy();
});

test('resource error', async () => {
  const tree = new PlTreeState(TestDynamicRootId1);
  const c1 = Computable.make((c) =>
    c.accessor(tree.entry()).node().traverse('a', 'b')?.getKeyValueAsString('thekey')
  );

  expect(c1.isChanged()).toBeTruthy();
  await expect(async () => await c1.getValue()).rejects.toThrow(/not found/);
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([
    { ...TestDynamicRootState1, error: rid(7n), fields: [] },
    {
      ...TestErrorResourceState2,
      id: rid(7n),
      data: Buffer.from('"error"'),
      fields: []
    }
  ]);

  expect((await c1.getValueOrError()).type).toEqual('error');
});

test('field error', async () => {
  const tree = new PlTreeState(TestDynamicRootId1);
  const c1 = Computable.make((c) =>
    c.accessor(tree.entry()).node().traverse('b', 'a')?.getKeyValueAsString('thekey')
  );

  expect(c1.isChanged()).toBeTruthy();
  await expect(async () => await c1.getValue()).rejects.toThrow(/not found/);
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([
    {
      ...TestDynamicRootState1,
      fields: [dField('b', NullResourceId, rid(7n))]
    },
    {
      ...TestErrorResourceState2,
      id: rid(7n),
      data: Buffer.from('"error"'),
      fields: []
    }
  ]);

  expect((await c1.getValueOrError()).type).toEqual('error');
});

test('exception - deletion of input field', () => {
  const tree = new PlTreeState(TestDynamicRootId1);

  tree.updateFromResourceData([
    { ...TestDynamicRootState1, fields: [dField('b'), dField('a', rid(1n))] },
    { ...TestStructuralResourceState1, id: rid(1n), fields: [iField('b', rid(2n))] },
    {
      ...TestValueResourceState1,
      id: rid(2n),
      data: new TextEncoder().encode('Test1')
    }
  ]);

  expect(() =>
    tree.updateFromResourceData([{ ...TestStructuralResourceState1, id: rid(1n), fields: [] }])
  ).toThrow(/removal of Input field/);
});

test('exception - addition of input field', () => {
  const tree = new PlTreeState(TestDynamicRootId1);

  tree.updateFromResourceData([
    { ...TestDynamicRootState1, fields: [dField('b'), dField('a', rid(1n))] },
    {
      ...TestStructuralResourceState1,
      id: rid(1n),
      fields: [iField('b', rid(2n))],
      ...ResourceReady
    },
    {
      ...TestValueResourceState1,
      id: rid(2n),
      data: new TextEncoder().encode('Test1')
    }
  ]);

  expect(() =>
    tree.updateFromResourceData([
      {
        ...TestStructuralResourceState1,
        id: rid(1n),
        fields: [iField('b', rid(2n)), iField('df')],
        ...ResourceReady
      }
    ])
  ).toThrow(/adding Input/);
});

test('exception - ready without locks 1', () => {
  const tree = new PlTreeState(TestDynamicRootId1);

  expect(() =>
    tree.updateFromResourceData([
      {
        ...TestDynamicRootState1,
        fields: [dField('b'), dField('a', rid(1n))]
      },
      {
        ...TestStructuralResourceState1,
        id: rid(1n),
        fields: [iField('b', rid(2n))],
        resourceReady: true
      },
      {
        ...TestValueResourceState1,
        id: rid(2n),
        data: new TextEncoder().encode('Test1')
      }
    ])
  ).toThrow(/ready without input or output lock/);
});

test('exception - ready without locks 2', () => {
  const tree = new PlTreeState(TestDynamicRootId1);

  tree.updateFromResourceData([
    { ...TestDynamicRootState1, fields: [dField('b'), dField('a', rid(1n))] },
    {
      ...TestStructuralResourceState1,
      id: rid(1n),
      fields: [iField('b', rid(2n))]
    },
    {
      ...TestValueResourceState1,
      id: rid(2n),
      data: new TextEncoder().encode('Test1')
    }
  ]);

  expect(() =>
    tree.updateFromResourceData([
      {
        ...TestDynamicRootState1,
        fields: [dField('b'), dField('a', rid(1n))]
      },
      {
        ...TestStructuralResourceState1,
        id: rid(1n),
        fields: [iField('b', rid(2n))],
        resourceReady: true
      },
      {
        ...TestValueResourceState1,
        id: rid(2n),
        data: new TextEncoder().encode('Test1')
      }
    ])
  ).toThrow(/ready without input or output lock/);
});
