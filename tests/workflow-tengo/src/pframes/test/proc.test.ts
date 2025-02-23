import type { PColumnSpec } from '@milaboratories/pl-middle-layer';
import { field, Pl, resourceType } from '@milaboratories/pl-middle-layer';
import { awaitStableState } from '@platforma-sdk/test';
import { assertBlob, assertJson, assertResource, eTplTest } from './extended_tpl_test';

eTplTest(
  'should correctly execute pframes.processColumn without aggregation',
  { timeout: 10000 },
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
    } satisfies PColumnSpec;
    const result = await helper.renderTemplate(
      true,
      'pframes.test.proc_1',
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
          spec: tx.createValue(
            Pl.JsonObject,
            JSON.stringify(inputSpec),
          ),
        };
      },
    );
    const r = stHelper.tree(result.resultEntry);
    const finalResult = await awaitStableState(r, 10000);
    // console.dir(finalResult, { depth: null });
    assertResource(finalResult);
    const theResult = finalResult.inputs['result'];
    assertResource(theResult);
    expect(theResult.resourceType.name).toEqual('PFrame');
    const bData = theResult.inputs['tsv.b.data'];
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

eTplTest(
  'should correctly execute pframes.processColumn with aggregation 1',
  { timeout: 10000 },
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
    } satisfies PColumnSpec;
    const result = await helper.renderTemplate(
      true,
      'pframes.test.proc_1',
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
    const finalResult = await awaitStableState(r, 10000);
    // console.dir(finalResult, { depth: null });
    assertResource(finalResult);
    const theResult = finalResult.inputs['result'];
    assertResource(theResult);
    expect(theResult.resourceType.name).toEqual('PFrame');
    const bData = theResult.inputs['tsv.b.data'];
    assertResource(bData);
    expect(bData.resourceType.name).toEqual('PColumnData/JsonPartitioned');
    const b1 = bData.inputs['[1]'];
    assertBlob(b1);
    const b1Content = JSON.parse(Buffer.from(b1.content).toString());
    const b2 = bData.inputs['[2]'];
    assertBlob(b2);
    const b2Content = JSON.parse(Buffer.from(b2.content).toString());
    expect(b1Content).toStrictEqual({ '[1]': 2, '[2]': 1 });
    expect(b2Content).toStrictEqual({ '[1]': 3, '[3]': 2 });
    const bSpecRes = theResult.inputs['tsv.b.spec'];
    assertJson(bSpecRes);
    const bSpec = bSpecRes.content as PColumnSpec;
    expect(bSpec.axesSpec).toMatchObject([
      inputSpec.axesSpec[1],
      xsvSettings.axes[0].spec,
    ]);
    expect(bSpec).toMatchObject(xsvSettings.columns[0].spec);
    expect(bSpec.annotations).toHaveProperty('pl7.app/trace');
  },
);

eTplTest(
  'should correctly execute pframes.processColumn with aggregation 2',
  { timeout: 10000 },
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
    } satisfies PColumnSpec;
    const result = await helper.renderTemplate(
      true,
      'pframes.test.proc_1',
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
              aggregate: [{ name: 'inputAxis2', type: 'Int' }],
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
    const finalResult = await awaitStableState(r, 10000);
    // console.dir(finalResult, { depth: null });
    assertResource(finalResult);
    const theResult = finalResult.inputs['result'];
    assertResource(theResult);
    expect(theResult.resourceType.name).toEqual('PFrame');
    const bData = theResult.inputs['tsv.b.data'];
    assertResource(bData);
    expect(bData.resourceType.name).toEqual('PColumnData/JsonPartitioned');
    const b1 = bData.inputs['[1]'];
    assertBlob(b1);
    const b1Content = JSON.parse(Buffer.from(b1.content).toString());
    expect(bData.inputs).not.toHaveProperty('[2]');
    expect(b1Content).toStrictEqual({ '[1]': 2, '[2]': 1 });
    const bSpecRes = theResult.inputs['tsv.b.spec'];
    assertJson(bSpecRes);
    const bSpec = bSpecRes.content as PColumnSpec;
    expect(bSpec.axesSpec).toMatchObject([
      inputSpec.axesSpec[0],
      xsvSettings.axes[0].spec,
    ]);
    expect(bSpec).toMatchObject(xsvSettings.columns[0].spec);
    expect(bSpec.annotations).toHaveProperty('pl7.app/trace');
  },
);
