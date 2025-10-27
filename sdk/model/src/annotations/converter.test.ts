import type { SUniversalPColumnId } from '@milaboratories/pl-model-common';
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
              { type: 'isNA', column: 'colA' as unknown as SUniversalPColumnId },
              { type: 'patternEquals', column: 'colB' as unknown as SUniversalPColumnId, value: 'abc' },
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
});


