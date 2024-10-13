import { z } from 'zod';
import { InferSnapshot, makeResourceSnapshot, rsSchema } from './snapshot';
import {
  TestDynamicRootId1,
  TestDynamicRootState1,
  TestStructuralResourceState1,
  TestStructuralResourceType1,
  TestValueResourceState1,
  dField,
  iField
} from './test_utils';
import { PlTreeState } from './state';
import { Computable } from '@milaboratories/computable';
import { DefaultFinalResourceDataPredicate, ResourceId } from '@milaboratories/pl-client';

// schema definition
const MyTestResourceState = rsSchema({
  data: z.object({
    jf: z.number()
  }),
  fields: { b: true, c: false },
  kv: { thekey: z.string() }
});

// type derived from schema for out users and us
type MyTestResourceState = InferSnapshot<typeof MyTestResourceState>;

test('simple snapshot test', async () => {
  const tree = new PlTreeState(TestDynamicRootId1, DefaultFinalResourceDataPredicate);

  const c1 = Computable.make((ctx) => {
    const accessor = ctx.accessor(tree.entry()).node().traverse('a');
    if (accessor == undefined) return undefined;

    const result: MyTestResourceState = makeResourceSnapshot(accessor, MyTestResourceState);
    return result;
  });

  tree.updateFromResourceData([
    { ...TestDynamicRootState1, fields: [dField('b'), dField('a', rid(1n))] },
    {
      ...TestStructuralResourceState1,
      id: rid(1n),
      fields: [iField('b', rid(2n))],
      data: new TextEncoder().encode(`{"jf": 0}`)
    },
    {
      ...TestValueResourceState1,
      id: rid(2n)
    }
  ]);

  expect(c1.isChanged()).toBeTruthy();
  expect((await c1.getValueOrError()).type).toStrictEqual('error');
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([
    {
      ...TestValueResourceState1,
      id: rid(1n),
      fields: [iField('b', rid(2n))],
      data: new TextEncoder().encode(`{"jf": 0}`),
      kv: [{ key: 'thekey', value: Buffer.from('"thevalue"') }]
    }
  ]);

  expect(c1.isChanged()).toBeTruthy();
  expect(await c1.getValue()).toMatchObject({
    id: rid(1n),
    type: TestStructuralResourceType1,
    data: {
      jf: 0
    },
    fields: {
      b: rid(2n),
      c: undefined
    },
    kv: {
      thekey: 'thevalue'
    }
  } as MyTestResourceState);
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([
    {
      ...TestValueResourceState1,
      id: rid(1n),
      fields: [iField('b', rid(2n))],
      data: new TextEncoder().encode(`{"jf": 0}`),
      kv: [{ key: 'thekey', value: Buffer.from('123') }] // thekey type changed to number (invalid accordig to zod schema)
    }
  ]);

  expect(c1.isChanged()).toBeTruthy();
  expect((await c1.getValueOrError()).type).toStrictEqual('error');
  expect(c1.isChanged()).toBeFalsy();
});

function rid(id: bigint): ResourceId {
  return id as ResourceId;
}
