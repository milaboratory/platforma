import type { AnyRef} from '@milaboratories/pl-middle-layer';
import { Pl, field, resourceType } from '@milaboratories/pl-middle-layer';
import { awaitStableState, tplTest } from '@platforma-sdk/test';

tplTest.for([
  {
    name: '[0]',
    nested: false,
    indices: [0],
    expectedResult: { '[1]': 1, '[2]': 1 }
  },
  { name: '[1]', nested: false, indices: [1], expectedResult: { '[1]': 2 } },
  {
    name: '[]',
    nested: false,
    indices: [],
    expectedResult: { '[1,1]': 1, '[1,2]': 1 }
  },
  {
    name: '[0,1]',
    nested: false,
    indices: [0, 1],
    expectedResult: { '[]': 2 }
  },
  {
    name: '[0]+3',
    nested: false,
    indices: [0],
    expectedResult: { '[1]': 4, '[2]': 4 },
    base: 3
  },
  {
    name: 'n[0]',
    nested: true,
    indices: [0],
    expectedResult: { '[1]': 1, '[2]': 1 }
  },
  { name: 'n[1]', nested: true, indices: [1], expectedResult: { '[1]': 2 } },
  {
    name: 'n[]',
    nested: true,
    indices: [],
    expectedResult: { '[1,1]': 1, '[1,2]': 1 }
  },
  {
    name: 'n[0,1]',
    nested: true,
    indices: [0, 1],
    expectedResult: { '[]': 2 }
  },
  {
    name: 'n[0]+3',
    nested: true,
    indices: [0],
    expectedResult: { '[1]': 4, '[2]': 4 },
    base: 3
  }
])(
  'should correctly execute low level aggregation routine $name',
  { timeout: 10000 },
  async ({ indices, expectedResult, nested, base }, { helper, expect }) => {
    const result = await helper.renderTemplate(
      true,
      'pframes.test.ll.agg_1',
      ['result'],
      (tx) => {
        const v1 = tx.createValue(Pl.JsonObject, JSON.stringify(1));

        const data = tx.createStruct(
          resourceType('PColumnData/ResourceMap', '1'),
          JSON.stringify({
            keyLength: 2
          })
        );
        tx.createField(field(data, '[1, 1]'), 'Input', v1);
        tx.createField(field(data, '[1, 2]'), 'Input', v1);
        tx.lockInputs(data);

        const inputs: Record<string, AnyRef> = {
          params: tx.createValue(
            Pl.JsonObject,
            JSON.stringify({
              indices,
              eph: false
            })
          ),
          nested: tx.createValue(Pl.JsonObject, JSON.stringify(nested)),
          data: data
        };

        if (base !== undefined) {
          inputs['base'] = tx.createValue(Pl.JsonObject, JSON.stringify(base));
        }

        return inputs;
      }
    );
    const r = result.computeOutput('result', (a, ctx) => {
      if (a === undefined) return undefined;
      if (!a.getIsReadyOrError()) {
        ctx.markUnstable('not_ready');
        return undefined;
      }
      return Object.fromEntries(
        a.listInputFields().map((f) => [f, a.traverse(f)!.getDataAsJson()])
      );
    });
    const finalResult = await awaitStableState(r, 10000);
    expect(finalResult).toStrictEqual(expectedResult);
  }
);
