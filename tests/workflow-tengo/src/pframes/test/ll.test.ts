import type { AnyRef } from '@milaboratories/pl-middle-layer';
import { Pl, field, resourceType } from '@milaboratories/pl-middle-layer';
import { awaitStableState, tplTest } from '@platforma-sdk/test';
import { assertBlob, assertResource, eTplTest } from './extended_tpl_test';

tplTest.concurrent.for([
  {
    name: '[0]',
    nested: false,
    indices: [0],
    expectedResult: { '[1]': 1, '[2]': 1 },
  },
  { name: '[1]', nested: false, indices: [1], expectedResult: { '[1]': 2 } },
  {
    name: '[]',
    nested: false,
    indices: [],
    expectedResult: { '[1,1]': 1, '[1,2]': 1 },
  },
  {
    name: '[0,1]',
    nested: false,
    indices: [0, 1],
    expectedResult: { '[]': 2 },
  },
  {
    name: '[0]+3',
    nested: false,
    indices: [0],
    expectedResult: { '[1]': 4, '[2]': 4 },
    base: 3,
  },
  {
    name: 'n[0]',
    nested: true,
    indices: [0],
    expectedResult: { '[1]': 1, '[2]': 1 },
  },
  { name: 'n[1]', nested: true, indices: [1], expectedResult: { '[1]': 2 } },
  {
    name: 'n[]',
    nested: true,
    indices: [],
    expectedResult: { '[1,1]': 1, '[1,2]': 1 },
  },
  {
    name: 'n[0,1]',
    nested: true,
    indices: [0, 1],
    expectedResult: { '[]': 2 },
  },
  {
    name: 'n[0]+3',
    nested: true,
    indices: [0],
    expectedResult: { '[1]': 4, '[2]': 4 },
    base: 3,
  },
])(
  'should correctly execute low level aggregation routine $name',
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
            keyLength: 2,
          }),
        );
        tx.createField(field(data, '[1,1]'), 'Input', v1);
        tx.createField(field(data, '[1,2]'), 'Input', v1);
        tx.lockInputs(data);

        const inputs: Record<string, AnyRef> = {
          params: tx.createValue(
            Pl.JsonObject,
            JSON.stringify({
              indices,
              eph: false,
            }),
          ),
          nested: tx.createValue(Pl.JsonObject, JSON.stringify(nested)),
          data: data,
        };

        if (base !== undefined) {
          inputs['base'] = tx.createValue(Pl.JsonObject, JSON.stringify(base));
        }

        return inputs;
      },
    );
    const r = result.computeOutput('result', (a, ctx) => {
      if (a === undefined) return undefined;
      if (!a.getIsReadyOrError()) {
        ctx.markUnstable('not_ready');
        return undefined;
      }
      return Object.fromEntries(
        a.listInputFields().map((f) => [f, a.traverse(f)!.getDataAsJson()]),
      );
    });
    const finalResult = await awaitStableState(r, 10000);
    expect(finalResult).toStrictEqual(expectedResult);
  },
);

eTplTest.concurrent(
  'should correctly execute low level aggregation routine with xsv parsing',
  async ({ helper, expect, stHelper }) => {
    const xsvSettings = {
      axes: [
        {
          column: 'a',
          spec: {
            name: 'a',
            type: 'Long',
            annotations: {
              'pl7.app/label': 'A',
            },
          },
        },
      ],
      columns: [
        {
          column: 'b',
          id: 'b',
          spec: {
            valueType: 'Long',
            name: 'b',
            annotations: {
              'pl7.app/label': 'B',
            },
          },
        },
      ],
      storageFormat: 'Json',
      partitionKeyLength: 0,
    };
    const result = await helper.renderTemplate(
      true,
      'pframes.test.ll.agg_2',
      ['result'],
      (tx) => {
        const tsvContent1 = tx.createValue(Pl.JsonObject, JSON.stringify('a\tb\n1\t2\n2\t1\n'));
        const tsvContent2 = tx.createValue(Pl.JsonObject, JSON.stringify('a\tb\n3\t2\n1\t3\n'));

        const data = tx.createStruct(
          resourceType('PColumnData/ResourceMap', '1'),
          JSON.stringify({
            keyLength: 2,
          }),
        );
        tx.createField(field(data, '[1,1]'), 'Input', tsvContent1);
        tx.createField(field(data, '[1,2]'), 'Input', tsvContent2);
        tx.lockInputs(data);

        return {
          params: tx.createValue(
            Pl.JsonObject,
            JSON.stringify({
              xsvSettings,
              eph: false,
            }),
          ),
          data: data,
        };
      },
    );
    const r = stHelper.tree(result.resultEntry);
    const finalResult = await awaitStableState(r, 10000);
    assertResource(finalResult);
    const theResult = finalResult.inputs['result'];
    assertResource(theResult);
    const bData = theResult.inputs['b.data'];
    assertResource(bData);
    expect(bData.resourceType.name).toEqual('PColumnData/JsonPartitioned');
    const b11 = bData.inputs['[1,1]'];
    assertBlob(b11);
    const b11Content = JSON.parse(Buffer.from(b11.content).toString());
    const b12 = bData.inputs['[1,2]'];
    assertBlob(b12);
    const b12Content = JSON.parse(Buffer.from(b12.content).toString());
    expect(b11Content).toStrictEqual({ '[1]': 2, '[2]': 1 });
    expect(b12Content).toStrictEqual({ '[1]': 3, '[3]': 2 });
  },
);
