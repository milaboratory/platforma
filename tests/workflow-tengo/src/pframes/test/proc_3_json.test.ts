import type { PUniversalColumnSpec } from '@milaboratories/pl-middle-layer';
import { Pl, resourceType } from '@milaboratories/pl-middle-layer';
import { awaitStableState } from '@platforma-sdk/test';
import { assertJson, assertResource, eTplTest } from './extended_tpl_test';
import { expect } from 'vitest';
import type { Computable } from '@milaboratories/computable';
import { getTestTimeout } from '@milaboratories/helpers';

const TIMEOUT = getTestTimeout(15_000);

const INPUT_SPEC: PUniversalColumnSpec = {
  kind: 'PColumn',
  name: 'inputColumn',
  valueType: 'Int',
  axesSpec: [
    { name: 'inputAxis1', type: 'Long' },
    { name: 'inputAxis2', type: 'Int', domain: { domain3: 'd3' } },
  ],
};

async function waitForResultMap(
  result: { resultEntry: unknown },
  stHelper: { tree(entry: unknown): Computable<unknown, unknown> },
  timeout = TIMEOUT,
) {
  const r = stHelper.tree(result.resultEntry);
  const finalResult = await awaitStableState(r, timeout);
  assertResource(finalResult);
  const theResult = finalResult.inputs['result'];
  assertResource(theResult);
  expect(theResult.resourceType.name).toEqual('PColumnData/ResourceMap');
  return theResult;
}

eTplTest.concurrent(
  'should correctly execute pframes.processColumn with PColumnData/Json in mapping mode',
  { timeout: TIMEOUT },
  async ({ helper, expect, stHelper }) => {
    const inputSpec = INPUT_SPEC;

    const result = await helper.renderTemplate(
      true,
      'pframes.test.proc_3_json',
      ['result'],
      (tx) => {
        // Create PColumnData/Json with embedded primitive values
        const data = tx.createStruct(
          resourceType('PColumnData/Json', '1'),
          JSON.stringify({
            keyLength: 2,
            data: {
              '[1,1]': 10,
              '[1,2]': 20,
              '[2,1]': 30,
              '[2,2]': 40,
            },
          }),
        );
        tx.lockInputs(data);

        return {
          params: tx.createValue(
            Pl.JsonObject,
            JSON.stringify({
              // No aggregation - mapping mode
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

    const theResult = await waitForResultMap(result, stHelper);

    // In mapping mode, each primitive value should be processed individually
    for (const [key, expected] of [
      ['[1,1]', 'direct_10'],
      ['[1,2]', 'direct_20'],
      ['[2,1]', 'direct_30'],
      ['[2,2]', 'direct_40'],
    ] as const) {
      const node = theResult.inputs[key];
      assertJson(node);
      expect(node.content).toBe(expected);
    }
  },
);

eTplTest.concurrent(
  'should correctly execute pframes.processColumn with PColumnData/Json in aggregation mode',
  { timeout: TIMEOUT },
  async ({ helper, expect, stHelper }) => {
    const inputSpec = INPUT_SPEC;

    const result = await helper.renderTemplate(
      true,
      'pframes.test.proc_3_json',
      ['result'],
      (tx) => {
        // Create PColumnData/Json with embedded primitive values
        const data = tx.createStruct(
          resourceType('PColumnData/Json', '1'),
          JSON.stringify({
            keyLength: 2,
            data: {
              '[1,1]': 10,
              '[1,2]': 20,
              '[2,1]': 30,
              '[2,2]': 40,
            },
          }),
        );
        tx.lockInputs(data);

        return {
          params: tx.createValue(
            Pl.JsonObject,
            JSON.stringify({
              aggregate: ['inputAxis1'], // Aggregate by first axis
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

    const theResult = await waitForResultMap(result, stHelper);

    // In aggregation mode, values should be grouped by second axis (group key)
    // Group [1]: contains values 10 (from [1,1]) and 30 (from [2,1]) -> sum = 40, count = 2
    const result1 = theResult.inputs['[1]'];
    assertJson(result1);
    expect(result1.content).toBe('group_sum_40_count_2');

    // Group [2]: contains values 20 (from [1,2]) and 40 (from [2,2]) -> sum = 60, count = 2
    const result2 = theResult.inputs['[2]'];
    assertJson(result2);
    expect(result2.content).toBe('group_sum_60_count_2');
  },
);

eTplTest.concurrent(
  'should correctly execute pframes.processColumn with PColumnData/Json in aggregation mode by second axis',
  { timeout: TIMEOUT },
  async ({ helper, expect, stHelper }) => {
    const inputSpec = INPUT_SPEC;

    const result = await helper.renderTemplate(
      true,
      'pframes.test.proc_3_json',
      ['result'],
      (tx) => {
        // Create PColumnData/Json with embedded primitive values
        const data = tx.createStruct(
          resourceType('PColumnData/Json', '1'),
          JSON.stringify({
            keyLength: 2,
            data: {
              '[1,1]': 10,
              '[1,2]': 20,
              '[2,1]': 30,
              '[2,2]': 40,
            },
          }),
        );
        tx.lockInputs(data);

        return {
          params: tx.createValue(
            Pl.JsonObject,
            JSON.stringify({
              aggregate: [{ name: 'inputAxis2', type: 'Int' }], // Aggregate by second axis
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

    const theResult = await waitForResultMap(result, stHelper);

    // In aggregation mode, values should be grouped by first axis (when aggregating by second axis)
    // Group [1]: contains values 10 (from [1,1]) and 20 (from [1,2]) -> sum = 40, count = 2
    const result1 = theResult.inputs['[1]'];
    assertJson(result1);
    expect(result1.content).toBe('group_sum_30_count_2');

    // Group [2]: contains values 30 (from [2,1]) and 40 (from [2,2]) -> sum = 60, count = 2
    const result2 = theResult.inputs['[2]'];
    assertJson(result2);
    expect(result2.content).toBe('group_sum_70_count_2');
  },
);
