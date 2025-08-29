import type { SUniversalPColumnId } from '@milaboratories/pl-model-common';
import { describe, expect, test } from 'vitest';
import { FiltersUi } from '../filters';
import { convertAnnotationScript } from './converter';
import { AnnotationScript } from './types';

describe('convertAnnotationScript', () => {
  test('should compile an empty annotation script', () => {
    const script = convertAnnotationScript({ title: 'My Annotation',  steps: [] });
    expect(script).toEqual({ title: 'My Annotation', steps: [] });
  });

  test('should compile an annotation script with steps', () => {
    // Helper type for testing, refine if needed
    type AnnotationStepUi = {
      label: string;
      filter: Extract<FiltersUi, { type: 'and' | 'or' }>;
    };
    const uiScript: { title: string;  steps: AnnotationStepUi[] } = {
      title: 'My Annotation',
      
      steps: [
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
      ],
    };
    const expectedScript: AnnotationScript = {
      title: 'My Annotation',
      steps: [
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
      ],
    };
    const script = convertAnnotationScript(uiScript);
    expect(script).toEqual(expectedScript);
  });
});
