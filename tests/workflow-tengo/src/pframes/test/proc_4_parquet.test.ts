import type { PUniversalColumnSpec } from '@milaboratories/pl-middle-layer';
import { Annotation, field, resourceType } from '@milaboratories/pl-middle-layer';
import { awaitStableState } from '@platforma-sdk/test';
import { assertResource, eTplTest } from './extended_tpl_test';
import { getLongTestTimeout } from '@milaboratories/test-helpers';
import { vi } from 'vitest';
import dedent from 'dedent';

const TIMEOUT = getLongTestTimeout(60_000);

vi.setConfig({
  testTimeout: TIMEOUT,
});

const inputSpec: PUniversalColumnSpec = {
  kind: 'PColumn',
  name: 'inputColumn',
  valueType: 'File',
  axesSpec: [
    { name: 'inputAxis1', type: 'Long' },
    { name: 'inputAxis2', type: 'Int', domain: { domain3: 'd3' } },
  ],
};

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
          [Annotation.Label]: 'A',
        } satisfies Annotation,
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
          [Annotation.Label]: 'B',
        } satisfies Annotation,
      },
    },
  ],
  storageFormat: 'Parquet',
  partitionKeyLength: 0,
} as const;

eTplTest.concurrent(
  'should correctly execute pframes.processColumn with Xsv, xsvType = parquet',
  async ({ helper, expect, stHelper }) => {
    const result = await helper.renderTemplate(
      true,
      'pframes.test.proc_4_parquet',
      ['result'],
      (tx) => {
        const data = tx.createStruct(
          resourceType('PColumnData/ResourceMap', '1'),
          JSON.stringify({
            keyLength: 2,
          }),
        );
        tx.createField(field(data, '[1,1]'), 'Input', tx.createJsonValue(dedent`
          a,b
          1,2
          2,1
        `));
        tx.createField(field(data, '[1,2]'), 'Input', tx.createJsonValue(dedent`
          a,b
          3,2
          1,3
        `));
        tx.lockInputs(data);

        return {
          spec: tx.createJsonValue(inputSpec),
          data: data,
          params: tx.createJsonValue({
            xsvSettings,
            eph: false,
          }),
        };
      },
    );

    const r = stHelper.tree(result.resultEntry);
    const finalResult = await awaitStableState(r, TIMEOUT);
    assertResource(finalResult);
    const theResult = finalResult.inputs['result'];
    assertResource(theResult);
    expect(theResult.resourceType.name).toEqual('PFrame');

    const bData = theResult.inputs['parquet.b.data'];
    assertResource(bData);
    expect(bData.resourceType.name).toEqual('PColumnData/ParquetPartitioned');
  },
);
