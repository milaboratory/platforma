import type { SUniversalPColumnId } from '@milaboratories/pl-model-common';
import { describe, expect, test } from 'vitest';
import { convertAnnotations } from './converter';
import { AnnotationSpec, AnnotationSpecUi } from './types';

describe('convertAnnotations', () => {
  test('should compile an empty annotation script', () => {
    const script = convertAnnotations([]);
    expect(script).toEqual([]);
  });

  test('should compile an annotation script with steps', () => {
    const annotationsUI: AnnotationSpecUi[] = [
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
    const expectedAnnotations: AnnotationSpec[] = [
        {
          label: 'Step 1',
          expression: {
            type: 'and',
            operands: [
              { type: 'is_na', value: { type: 'col', name: 'colA' } },
              { type: 'eq', lhs: { type: 'col', name: 'colB' }, rhs: { type: 'const', value: 'abc' } },
            ],
          }, // Use any to avoid complex type assertions in expected result
        },
      ];
    const script = convertAnnotations(annotationsUI);
    expect(script).toEqual(expectedAnnotations);
  });
});
