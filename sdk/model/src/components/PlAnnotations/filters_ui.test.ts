import { describe, it, expect, test } from 'vitest';
import { compileAnnotationScript, compileFilter, type FilterUi } from './filters_ui';
import type { AnnotationFilter, AnnotationScript, NotFilter, IsNA, PatternFilter, NumericalComparisonFilter, ValueRank } from './filter';
import type { SUniversalPColumnId } from '@platforma-sdk/model';

describe('compileAnnotationScript', () => {
  test('should compile an empty annotation script', () => {
    const script = compileAnnotationScript({ mode: 'byClonotype', steps: [] });
    expect(script).toEqual({ mode: 'byClonotype', steps: [] });
  });

  test('should compile an annotation script with steps', () => {
    // Helper type for testing, refine if needed
    type AnnotationStepUi = {
      label: string;
      filter: Extract<FilterUi, { type: 'and' | 'or' }>;
    };
    const uiScript: { mode: 'byClonotype'; steps: AnnotationStepUi[] } = {
      mode: 'byClonotype',
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
      mode: 'byClonotype',
      steps: [
        {
          label: 'Step 1',
          filter: {
            type: 'and',
            filters: [
              { type: 'isNA', column: 'colA' as unknown as SUniversalPColumnId },
              { type: 'pattern', column: 'colB' as unknown as SUniversalPColumnId, predicate: { type: 'equals', value: 'abc' } },
            ],
          },
        },
      ],
    };
    const script = compileAnnotationScript(uiScript);
    expect(script).toEqual(expectedScript);
  });
});

describe('compileFilter', () => {
  it('should compile "or" filter', () => {
    const uiFilter: FilterUi = { type: 'or', filters: [{ type: 'isNA', column: 'colA' as unknown as SUniversalPColumnId }] };
    const expectedFilter: AnnotationFilter = { type: 'or', filters: [{ type: 'isNA', column: 'colA' as unknown as SUniversalPColumnId }] };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "and" filter', () => {
    const uiFilter: FilterUi = { type: 'and', filters: [{ type: 'isNA', column: 'colA' as unknown as SUniversalPColumnId }] };
    const expectedFilter: AnnotationFilter = { type: 'and', filters: [{ type: 'isNA', column: 'colA' as unknown as SUniversalPColumnId }] };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile nested "and"/"or" filters', () => {
    const uiFilter: FilterUi = {
      type: 'and',
      filters: [
        { type: 'isNA', column: 'colA' as unknown as SUniversalPColumnId },
        { type: 'or', filters: [{ type: 'patternEquals', column: 'colB' as unknown as SUniversalPColumnId, value: 'test' }] },
      ],
    };
    const expectedFilter: AnnotationFilter = {
      type: 'and',
      filters: [
        { type: 'isNA', column: 'colA' as unknown as SUniversalPColumnId },
        { type: 'or', filters: [{ type: 'pattern', column: 'colB' as unknown as SUniversalPColumnId, predicate: { type: 'equals', value: 'test' } }] },
      ],
    };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "not" filter', () => {
    const uiFilter: FilterUi = { type: 'not', filter: { type: 'isNA', column: 'colA' as unknown as SUniversalPColumnId } };
    const expectedFilter: AnnotationFilter = { type: 'not', filter: { type: 'isNA', column: 'colA' as unknown as SUniversalPColumnId } };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "isNA" filter', () => {
    const uiFilter: FilterUi = { type: 'isNA', column: 'colA' as unknown as SUniversalPColumnId };
    const expectedFilter: AnnotationFilter = { type: 'isNA', column: 'colA' as unknown as SUniversalPColumnId };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "isNotNA" filter', () => {
    const uiFilter: FilterUi = { type: 'isNotNA', column: 'colA' as unknown as SUniversalPColumnId };
    const expectedIsNA: IsNA = { type: 'isNA', column: 'colA' as unknown as SUniversalPColumnId };
    const expectedFilter: NotFilter = { type: 'not', filter: expectedIsNA };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "patternEquals" filter', () => {
    const uiFilter: FilterUi = { type: 'patternEquals', column: 'colB' as unknown as SUniversalPColumnId, value: 'abc' };
    const expectedFilter: AnnotationFilter = { type: 'pattern', column: 'colB' as unknown as SUniversalPColumnId, predicate: { type: 'equals', value: 'abc' } };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "patternNotEquals" filter', () => {
    const uiFilter: FilterUi = { type: 'patternNotEquals', column: 'colB' as unknown as SUniversalPColumnId, value: 'abc' };
    const expectedPatternFilter: PatternFilter = {
      type: 'pattern',
      column: 'colB' as unknown as SUniversalPColumnId,
      predicate: { type: 'equals', value: 'abc' },
    };
    const expectedFilter: NotFilter = { type: 'not', filter: expectedPatternFilter };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "patternContainSubsequence" filter', () => {
    const uiFilter: FilterUi = { type: 'patternContainSubsequence', column: 'colC' as unknown as SUniversalPColumnId, value: 'sub' };
    const expectedFilter: AnnotationFilter = { type: 'pattern', column: 'colC' as unknown as SUniversalPColumnId, predicate: { type: 'containSubsequence', value: 'sub' } };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "patternNotContainSubsequence" filter', () => {
    const uiFilter: FilterUi = { type: 'patternNotContainSubsequence', column: 'colC' as unknown as SUniversalPColumnId, value: 'sub' };
    const expectedPatternFilter: PatternFilter = {
      type: 'pattern',
      column: 'colC' as unknown as SUniversalPColumnId,
      predicate: { type: 'containSubsequence', value: 'sub' },
    };
    const expectedFilter: NotFilter = { type: 'not', filter: expectedPatternFilter };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "topN" filter (Top 5)', () => {
    const uiFilter: FilterUi = { type: 'topN', column: 'colNum' as unknown as SUniversalPColumnId, n: 5 };
    const expectedRank: ValueRank = { transformer: 'rank', column: 'colNum' as unknown as SUniversalPColumnId, descending: true };
    const expectedFilter: NumericalComparisonFilter = {
      type: 'numericalComparison',
      lhs: expectedRank,
      rhs: 5,
      allowEqual: true,
    };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "topN" filter (Bottom 3)', () => {
    const uiFilter: FilterUi = { type: 'bottomN', column: 'colNum' as unknown as SUniversalPColumnId, n: 3 };
    const expectedRank: ValueRank = { transformer: 'rank', column: 'colNum' as unknown as SUniversalPColumnId };
    const expectedFilter: NumericalComparisonFilter = {
      type: 'numericalComparison',
      lhs: expectedRank,
      rhs: 3,
      allowEqual: true,
    };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "lessThan" filter', () => {
    const uiFilter: FilterUi = { type: 'lessThan', column: 'colNum' as unknown as SUniversalPColumnId, x: 10 };
    const expectedFilter: AnnotationFilter = { type: 'numericalComparison', lhs: 'colNum' as unknown as SUniversalPColumnId, rhs: 10 };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "greaterThan" filter', () => {
    const uiFilter: FilterUi = { type: 'greaterThan', column: 'colNum' as unknown as SUniversalPColumnId, x: 5 };
    const expectedFilter: AnnotationFilter = { type: 'numericalComparison', rhs: 'colNum' as unknown as SUniversalPColumnId, lhs: 5 };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "lessThanOrEqual" filter', () => {
    const uiFilter: FilterUi = { type: 'lessThanOrEqual', column: 'colNum' as unknown as SUniversalPColumnId, x: 20 };
    const expectedFilter: AnnotationFilter = { type: 'numericalComparison', lhs: 'colNum' as unknown as SUniversalPColumnId, rhs: 20, allowEqual: true };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "greaterThanOrEqual" filter', () => {
    const uiFilter: FilterUi = { type: 'greaterThanOrEqual', column: 'colNum' as unknown as SUniversalPColumnId, x: 0 };
    const expectedFilter: AnnotationFilter = { type: 'numericalComparison', rhs: 'colNum' as unknown as SUniversalPColumnId, lhs: 0, allowEqual: true };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "lessThanColumn" filter', () => {
    const uiFilter: FilterUi = { type: 'lessThanColumn', column: 'colNum1' as unknown as SUniversalPColumnId, rhs: 'colNum2' as unknown as SUniversalPColumnId, minDiff: 5 };
    const expectedFilter: AnnotationFilter = { type: 'numericalComparison', lhs: 'colNum1' as unknown as SUniversalPColumnId, rhs: 'colNum2' as unknown as SUniversalPColumnId, minDiff: 5, allowEqual: undefined };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "lessThanColumnOrEqual" filter', () => {
    const uiFilter: FilterUi = { type: 'lessThanColumnOrEqual', column: 'colNum1' as unknown as SUniversalPColumnId, rhs: 'colNum2' as unknown as SUniversalPColumnId, minDiff: 6 };
    const expectedFilter: AnnotationFilter = { type: 'numericalComparison', lhs: 'colNum1' as unknown as SUniversalPColumnId, rhs: 'colNum2' as unknown as SUniversalPColumnId, minDiff: 6, allowEqual: true };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });
});

// Helper type for testing, refine if needed
// type AnnotationStepUi = {
//   label: string;
//   filter: Extract<FilterUi, { type: 'and' | 'or' }>;
// };
