import { PlTreeState } from './state';
import {
  dField,
  iField,
  ResourceReady,
  TestDynamicRootId1,
  TestDynamicRootState1,
  TestStructuralResourceState1,
  TestValueResourceState1
} from './test_utils';
import { computable } from '@milaboratory/computable';
import { ResourceId } from '@milaboratory/pl-client-v2';
import { mapValueAndErrorIfDefined } from './value_and_error';

function rid(id: bigint): ResourceId {
  return id as ResourceId;
}

test('simple tree test 1', async () => {
  const tree = new PlTreeState(TestDynamicRootId1);
  const c1 = computable(tree.accessor(), {}, (b) => {
    const res = b.traverse({}, 'a', 'b');
    return mapValueAndErrorIfDefined(res, (r) => r.getDataAsString());
  });
  expect(c1.isChanged()).toBeTruthy();
  expect(await c1.getValue()).toBeUndefined();
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([{ ...TestDynamicRootState1, fields: [] }]);
  expect(c1.isChanged()).toBeTruthy();
  expect(await c1.getValue()).toBeUndefined();
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([
    { ...TestDynamicRootState1, fields: [dField('b')] }
  ]);
  expect(c1.isChanged()).toBeTruthy();
  expect(await c1.getValue()).toBeUndefined();
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([
    { ...TestDynamicRootState1, fields: [dField('b'), dField('a')] }
  ]);
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
  expect(await c1.getValue()).toStrictEqual({ value: 'Test1' });
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([
    { ...TestDynamicRootState1, fields: [dField('a')] }
  ]);
  expect(c1.isChanged()).toBeTruthy();
  expect(await c1.getValue()).toBeUndefined();
  expect(c1.isChanged()).toBeFalsy();
});

test('simple tree kv test', async () => {
  const tree = new PlTreeState(TestDynamicRootId1);
  const c1 = computable(tree.accessor(), {}, (b) => {
    return b.traverseNoError({}, 'a', 'b')?.getKeyValueString('thekey');
  });
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
  const c1 = computable(tree.accessor(), {}, (b) => {
    const res = b.traverse(
      {},
      { field: 'a', assertFieldType: 'Dynamic' },
      { field: 'b', assertFieldType: 'Dynamic' }
    );
    return mapValueAndErrorIfDefined(res, (r) => r.getDataAsString());
  });
  expect(c1.isChanged()).toBeTruthy();
  expect(await c1.getValue()).toBeUndefined();
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
  expect(await c1.getValue()).toStrictEqual({ value: 'Test1' });
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([
    { ...TestStructuralResourceState1, id: rid(1n), fields: [] }
  ]);
  expect(c1.isChanged()).toBeTruthy();
  expect(await c1.getValue()).toBeUndefined();
  expect(c1.isChanged()).toBeFalsy();
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
    tree.updateFromResourceData([
      { ...TestStructuralResourceState1, id: rid(1n), fields: [] }
    ])
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
