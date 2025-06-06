import type { PColumnSpec, PUniversalColumnSpec } from '@milaboratories/pl-middle-layer';
import { field, Pl, resourceType } from '@milaboratories/pl-middle-layer';
import { awaitStableState } from '@platforma-sdk/test';
import { assertBlob, assertJson, assertResource, eTplTest } from './extended_tpl_test';

eTplTest.concurrent(
  'should correctly execute pframes.processColumn in sparse mode without aggregation',
  { timeout: 40000 },
  async ({ helper, expect, stHelper }) => {
    const xsvSettings = {
      axes: [
        {
          column: 'a',
          spec: {
            name: 'a',
            type: 'Long',
            domain: {
              domain1: 'value',
            },
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
    const inputSpec = {
      kind: 'PColumn',
      name: 'inputColumn',
      valueType: 'File',
      axesSpec: [
        { name: 'inputAxis1', type: 'Long' },
        { name: 'inputAxis2', type: 'Int', domain: { domain3: 'd3' } },
      ],
    } satisfies PUniversalColumnSpec;
    const result = await helper.renderTemplate(
      true,
      'pframes.test.proc_2_sparse',
      ['result'],
      (tx) => {
        const tsvContent1 = tx.createValue(Pl.JsonObject, JSON.stringify('a\tb\n1\t2\n2\t1\n'));
        const tsvContent2 = tx.createValue(Pl.JsonObject, JSON.stringify('no_content'));

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
          spec: tx.createValue(
            Pl.JsonObject,
            JSON.stringify(inputSpec),
          ),
        };
      },
    );
    const r = stHelper.tree(result.resultEntry);
    const finalResult = await awaitStableState(r, 40000);
    // console.dir(finalResult, { depth: null });
    assertResource(finalResult);
    const theResult = finalResult.inputs['result'];
    assertResource(theResult);
    expect(theResult.resourceType.name).toEqual('PFrame');
    const bData = theResult.inputs['tsv.b.data'];
    assertResource(bData);
    expect(bData.resourceType.name).toEqual('PColumnData/JsonPartitioned');
    expect(Object.keys(bData.inputs).length).toBe(1);
    const b11 = bData.inputs['[1,1]'];
    assertBlob(b11);
    const b11Content = JSON.parse(Buffer.from(b11.content).toString());
    expect(b11Content).toStrictEqual({ '[1]': 2, '[2]': 1 });
    const bSpecRes = theResult.inputs['tsv.b.spec'];
    assertJson(bSpecRes);
    const bSpec = bSpecRes.content as PColumnSpec;
    expect(bSpec.axesSpec).toMatchObject([
      ...inputSpec.axesSpec,
      xsvSettings.axes[0].spec,
    ]);
    expect(bSpec).toMatchObject(xsvSettings.columns[0].spec);
    expect(bSpec.annotations).toHaveProperty('pl7.app/trace');
  },
);

eTplTest.concurrent(
  'should correctly execute pframes.processColumn in sparse mode with aggregation 1',
  { timeout: 40000 },
  async ({ helper, expect, stHelper }) => {
    const xsvSettings = {
      axes: [
        {
          column: 'a',
          spec: {
            name: 'a',
            type: 'Long',
            domain: {
              domain1: 'value',
            },
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
    const inputSpec = {
      kind: 'PColumn',
      name: 'inputColumn',
      valueType: 'File',
      axesSpec: [
        { name: 'inputAxis1', type: 'Long' },
        { name: 'inputAxis2', type: 'Int', domain: { domain3: 'd3' } },
      ],
    } satisfies PUniversalColumnSpec;
    const result = await helper.renderTemplate(
      true,
      'pframes.test.proc_2_sparse',
      ['result'],
      (tx) => {
        const tsvContent1 = tx.createValue(Pl.JsonObject, JSON.stringify('a\tb\n1\t2\n2\t1\n'));
        const tsvContent2 = tx.createValue(Pl.JsonObject, JSON.stringify('no_content'));

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
              aggregate: ['inputAxis1'],
            }),
          ),
          data: data,
          spec: tx.createValue(
            Pl.JsonObject,
            JSON.stringify(inputSpec),
          ),
        };
      },
    );
    const r = stHelper.tree(result.resultEntry);
    const finalResult = await awaitStableState(r, 40000);
    // console.dir(finalResult, { depth: null });
    assertResource(finalResult);
    const theResult = finalResult.inputs['result'];
    assertResource(theResult);
    expect(theResult.resourceType.name).toEqual('PFrame');
    const bData = theResult.inputs['tsv.b.data'];
    assertResource(bData);
    expect(bData.resourceType.name).toEqual('PColumnData/JsonPartitioned');
    expect(Object.keys(bData.inputs).length).toBe(1);
    const b1 = bData.inputs['[1]'];
    assertBlob(b1);
    const b1Content = JSON.parse(Buffer.from(b1.content).toString());
    expect(b1Content).toStrictEqual({ '[1]': 2, '[2]': 1 });
  },
);
