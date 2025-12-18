import { describe, expect, test } from 'vitest';
import { convertFilterSpecsToExpressionSpecs } from './converter';
import { FilterSpecUi } from './types';

describe('convertFilterSpecsToExpressionSpecs', () => {
  test('should compile an empty annotation script', () => {
    const script = convertFilterSpecsToExpressionSpecs([]);
    expect(script).toEqual([]);
  });

  test('should compile an annotation script with steps', () => {
    const filters: FilterSpecUi[] = [
        {
          label: 'Step 1',
          filter: {
            type: 'and',
            filters: [
              { type: 'isNA', column: 'colA' } as any,
              { type: 'patternEquals', column: 'colB', value: 'abc' } as any,
            ],
          },
        },
      ];
    const expected = [
      {
        "name": "Step 1",
        "type": "alias",
        "value": {
          "conditions": [
            {
              "then": {
                "type": "const",
                "value": true,
              },
              "when": {
                "operands": [
                  {
                    "type": "is_na",
                    "value": {
                      "name": "colA",
                      "type": "col",
                    },
                  },
                  {
                    "lhs": {
                      "name": "colB",
                      "type": "col",
                    },
                    "rhs": {
                      "type": "const",
                      "value": "abc",
                    },
                    "type": "eq",
                  },
                ],
                "type": "and",
              },
            },
          ],
          "otherwise": {
            "type": "const",
            "value": false,
          },
          "type": "when_then_otherwise",
        }
      },
    ];
    const script = convertFilterSpecsToExpressionSpecs(filters);
    expect(script).toEqual(expected);
  });

  test('should filter out empty/unset filter conditions', () => {
    const filters: FilterSpecUi[] = [
      {
        label: 'Step with various unset filters',
        filter: {
          type: 'and',
          filters: [
            {} as any,
            { type: undefined } as any,
            { type: 'isNA', column: 'colA' },
            { type: 'isNA', column: undefined } as any,
            { type: 'isNotNA', column: undefined } as any,
            { type: 'patternEquals', column: undefined, value: 'test' },
            { type: 'patternEquals', column: 'colX', value: undefined } as any,
            { type: 'patternNotEquals', column: undefined, value: 'test' } as any,
            { type: 'patternNotEquals', column: 'colX', value: undefined } as any,
            { type: 'patternContainSubsequence', column: undefined, value: 'test' } as any,
            { type: 'patternContainSubsequence', column: 'colX', value: undefined } as any,
            { type: 'equal', column: undefined, x: 5 } as any,
            { type: 'equal', column: 'colX', x: undefined } as any,
            { type: 'lessThan', column: undefined, x: 5 } as any,
            { type: 'lessThan', column: 'colX', x: undefined } as any,
            { type: 'greaterThan', column: undefined, x: 5 } as any,
            { type: 'greaterThan', column: 'colX', x: undefined } as any,
            { type: 'topN', column: undefined, n: 5 } as any,
            { type: 'topN', column: 'colX', n: undefined } as any,
            { type: 'bottomN', column: undefined, n: 5 } as any,
            { type: 'bottomN', column: 'colX', n: undefined } as any,
            { type: 'equalToColumn', column: undefined, rhs: 'colY' } as any,
            { type: 'equalToColumn', column: 'colX', rhs: undefined } as any,
            { type: 'greaterThanColumn', column: undefined, rhs: 'colY' } as any,
            { type: 'greaterThanColumn', column: 'colX', rhs: undefined } as any,
            { type: 'lessThanColumn', column: undefined, rhs: 'colY' } as any,
            { type: 'lessThanColumn', column: 'colX', rhs: undefined } as any,
            { type: undefined, column: 'colX', value: 'someValue' } as any,
          ],
        },
      },
      {
        label: 'Step with nested unset filters',
        filter: {
          type: 'or',
          filters: [
            {
              type: 'and',
              filters: [
                { type: undefined } as any,
                { type: 'patternEquals', column: 'colB', value: 'test' },
                { type: undefined, column: undefined } as any,
              ],
            },
            { type: undefined } as any,
            {
              type: 'or',
              filters: [
                { type: undefined } as any,
                { type: undefined, value: undefined } as any,
              ],
            } as any,
          ],
        },
      },
    ];
    const expected = [
      {
        name: 'Step with various unset filters',
        type: 'alias',
        value: {
          conditions: [
            {
              then: {
                type: 'const',
                value: true,
              },
              when: {
                type: 'and',
                operands: [
                  {
                    type: 'is_na',
                    value: {
                      name: 'colA',
                      type: 'col',
                    },
                  },
                ],
              },
            },
          ],
          otherwise: {
            type: 'const',
            value: false,
          },
          type: 'when_then_otherwise',
        },
      },
      {
        name: 'Step with nested unset filters',
        type: 'alias',
        value: {
          conditions: [
            {
              then: {
                type: 'const',
                value: true,
              },
              when: {
                type: 'or',
                operands: [
                  {
                    type: 'and',
                    operands: [
                      {
                        lhs: {
                          name: 'colB',
                          type: 'col',
                        },
                        rhs: {
                          type: 'const',
                          value: 'test',
                        },
                        type: 'eq',
                      },
                    ],
                  },
                ],
              },
            },
          ],
          otherwise: {
            type: 'const',
            value: false,
          },
          type: 'when_then_otherwise',
        },
      },
    ];
    const script = convertFilterSpecsToExpressionSpecs(filters);
    expect(script).toEqual(expected);
  });
});
