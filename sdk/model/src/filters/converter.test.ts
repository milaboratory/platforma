import type { SUniversalPColumnId } from '@milaboratories/pl-model-common';
import { describe, expect, it } from 'vitest';
import { convertFilterUiToExpressions } from './converter';
import { FilterSpec } from './types';

describe('convertFilterUiToExpressions', () => {
  it('should compile "or" filter to ptabler expression', () => {
    const uiFilter: FilterSpec = {
      type: 'or',
      filters: [
        { type: 'isNA', column: 'colA' as unknown as SUniversalPColumnId },
        { type: 'patternEquals', column: 'colB' as unknown as SUniversalPColumnId, value: 'test' },
      ],
    };
    const result = convertFilterUiToExpressions(uiFilter);
    expect(result.type).toBe('or');
    expect((result as any).operands).toHaveLength(2);
    expect((result as any).operands[0].type).toBe('is_na');
    expect((result as any).operands[1].type).toBe('eq');
  });

  it('should compile "and" filter to ptabler expression', () => {
    const uiFilter: FilterSpec = {
      type: 'and',
      filters: [
        { type: 'isNA', column: 'colA' as unknown as SUniversalPColumnId },
        { type: 'greaterThan', column: 'colNum' as unknown as SUniversalPColumnId, x: 10 },
      ],
    };
    const result = convertFilterUiToExpressions(uiFilter);
    expect(result.type).toBe('and');
    expect((result as any).operands).toHaveLength(2);
    expect((result as any).operands[0].type).toBe('is_na');
    expect((result as any).operands[1].type).toBe('gt');
  });

  it('should compile "not" filter to ptabler expression', () => {
    const uiFilter: FilterSpec = {
      type: 'not',
      filter: { type: 'isNA', column: 'colA' as unknown as SUniversalPColumnId },
    };
    const result = convertFilterUiToExpressions(uiFilter);
    expect(result.type).toBe('not');
    expect((result as any).value.type).toBe('is_na');
    expect((result as any).value.value.type).toBe('col');
    expect((result as any).value.value.name).toBe('colA');
  });

  it('should compile "isNA" filter to ptabler expression', () => {
    const uiFilter: FilterSpec = { type: 'isNA', column: 'colA' as unknown as SUniversalPColumnId };
    const result = convertFilterUiToExpressions(uiFilter);
    expect(result as any).toEqual({
      type: 'is_na',
      value: { type: 'col', name: 'colA' },
    });
  });

  it('should compile "isNotNA" filter to ptabler expression', () => {
    const uiFilter: FilterSpec = { type: 'isNotNA', column: 'colA' as unknown as SUniversalPColumnId };
    const result = convertFilterUiToExpressions(uiFilter);
    expect(result as any).toEqual({
      type: 'is_not_na',
      value: { type: 'col', name: 'colA' },
    });
  });

  it('should compile "patternEquals" filter to ptabler expression', () => {
    const uiFilter: FilterSpec = { type: 'patternEquals', column: 'colB' as unknown as SUniversalPColumnId, value: 'abc' };
    const result = convertFilterUiToExpressions(uiFilter);
    expect(result as any).toEqual({
      type: 'eq',
      lhs: { type: 'col', name: 'colB' },
      rhs: { type: 'const', value: 'abc' },
    });
  });

  it('should compile "patternNotEquals" filter to ptabler expression', () => {
    const uiFilter: FilterSpec = { type: 'patternNotEquals', column: 'colB' as unknown as SUniversalPColumnId, value: 'abc' };
    const result = convertFilterUiToExpressions(uiFilter);
    expect(result as any).toEqual({
      type: 'neq',
      lhs: { type: 'col', name: 'colB' },
      rhs: { type: 'const', value: 'abc' },
    });
  });

  it('should compile "patternContainSubsequence" filter to ptabler expression', () => {
    const uiFilter: FilterSpec = { type: 'patternContainSubsequence', column: 'colC' as unknown as SUniversalPColumnId, value: 'sub' };
    const result = convertFilterUiToExpressions(uiFilter);
    expect(result.type).toBe('str_contains');
    expect((result as any).value).toEqual({ type: 'col', name: 'colC' });
    expect((result as any).pattern).toEqual({ type: 'const', value: 'sub' });
  });

  it('should compile "patternNotContainSubsequence" filter to ptabler expression', () => {
    const uiFilter: FilterSpec = { type: 'patternNotContainSubsequence', column: 'colC' as unknown as SUniversalPColumnId, value: 'sub' };
    const result = convertFilterUiToExpressions(uiFilter);
    expect(result.type).toBe('not');
    expect((result as any).value.type).toBe('str_contains');
    expect((result as any).value.value).toEqual({ type: 'col', name: 'colC' });
    expect((result as any).value.pattern).toEqual({ type: 'const', value: 'sub' });
  });

  it('should compile numerical comparison filters to ptabler expressions', () => {
    const testCases = [
      { type: 'equal' as const, expected: 'eq' },
      { type: 'lessThan' as const, expected: 'lt' },
      { type: 'greaterThan' as const, expected: 'gt' },
      { type: 'lessThanOrEqual' as const, expected: 'le' },
      { type: 'greaterThanOrEqual' as const, expected: 'ge' },
    ];

    testCases.forEach(({ type, expected }) => {
      const uiFilter: FilterSpec = { type, column: 'colNum' as unknown as SUniversalPColumnId, x: 10 };
      const result = convertFilterUiToExpressions(uiFilter);
      expect(result as any).toEqual({
        type: expected,
        lhs: { type: 'col', name: 'colNum' },
        rhs: { type: 'const', value: 10 },
      });
    });
  });

  it('should compile "lessThanColumn" filter to ptabler expression', () => {
    const uiFilter: FilterSpec = {
      type: 'lessThanColumn',
      column: 'colNum1' as unknown as SUniversalPColumnId,
      rhs: 'colNum2' as unknown as SUniversalPColumnId,
    };
    const result = convertFilterUiToExpressions(uiFilter);
    expect(result as any).toEqual({
      type: 'lt',
      lhs: { type: 'col', name: 'colNum1' },
      rhs: { type: 'col', name: 'colNum2' },
    });
  });

  it('should compile "lessThanColumn" filter with minDiff to ptabler expression', () => {
    const uiFilter: FilterSpec = {
      type: 'lessThanColumn',
      column: 'colNum1' as unknown as SUniversalPColumnId,
      rhs: 'colNum2' as unknown as SUniversalPColumnId,
      minDiff: 5,
    };
    const result = convertFilterUiToExpressions(uiFilter);
    expect(result as any).toEqual({
      type: 'lt',
      lhs: {
        type: 'plus',
        lhs: { type: 'col', name: 'colNum1' },
        rhs: { type: 'const', value: 5 },
      },
      rhs: { type: 'col', name: 'colNum2' },
    });
  });

  it('should compile "greaterThanColumn" filter to ptabler expression', () => {
    const uiFilter: FilterSpec = {
      type: 'greaterThanColumn',
      column: 'colNum1' as unknown as SUniversalPColumnId,
      rhs: 'colNum2' as unknown as SUniversalPColumnId,
    };
    const result = convertFilterUiToExpressions(uiFilter);
    expect(result as any).toEqual({
      type: 'gt',
      lhs: { type: 'col', name: 'colNum1' },
      rhs: { type: 'col', name: 'colNum2' },
    });
  });

  it('should compile "greaterThanColumn" filter with minDiff to ptabler expression', () => {
    const uiFilter: FilterSpec = {
      type: 'greaterThanColumn',
      column: 'colNum1' as unknown as SUniversalPColumnId,
      rhs: 'colNum2' as unknown as SUniversalPColumnId,
      minDiff: 7,
    };
    const result = convertFilterUiToExpressions(uiFilter);
    expect(result as any).toEqual({
      type: 'gt',
      lhs: {
        type: 'plus',
        lhs: { type: 'col', name: 'colNum1' },
        rhs: { type: 'const', value: 7 },
      },
      rhs: { type: 'col', name: 'colNum2' },
    });
  });

  it('should compile "equalToColumn" filter to ptabler expression', () => {
    const uiFilter: FilterSpec = {
      type: 'equalToColumn',
      column: 'colNum1' as unknown as SUniversalPColumnId,
      rhs: 'colNum2' as unknown as SUniversalPColumnId,
    };
    const result = convertFilterUiToExpressions(uiFilter);
    expect(result as any).toEqual({
      type: 'eq',
      lhs: { type: 'col', name: 'colNum1' },
      rhs: { type: 'col', name: 'colNum2' },
    });
  });

  it('should compile "greaterThanColumnOrEqual" filter to ptabler expression', () => {
    const uiFilter: FilterSpec = {
      type: 'greaterThanColumnOrEqual',
      column: 'colNum1' as unknown as SUniversalPColumnId,
      rhs: 'colNum2' as unknown as SUniversalPColumnId,
    };
    const result = convertFilterUiToExpressions(uiFilter);
    expect(result as any).toEqual({
      type: 'ge',
      lhs: { type: 'col', name: 'colNum1' },
      rhs: { type: 'col', name: 'colNum2' },
    });
  });

  it('should compile "greaterThanColumnOrEqual" filter with minDiff to ptabler expression', () => {
    const uiFilter: FilterSpec = {
      type: 'greaterThanColumnOrEqual',
      column: 'colNum1' as unknown as SUniversalPColumnId,
      rhs: 'colNum2' as unknown as SUniversalPColumnId,
      minDiff: 2,
    };
    const result = convertFilterUiToExpressions(uiFilter);
    expect(result as any).toEqual({
      type: 'ge',
      lhs: {
        type: 'plus',
        lhs: { type: 'col', name: 'colNum1' },
        rhs: { type: 'const', value: 2 },
      },
      rhs: { type: 'col', name: 'colNum2' },
    });
  });

  it('should compile "lessThanColumnOrEqual" filter to ptabler expression', () => {
    const uiFilter: FilterSpec = {
      type: 'lessThanColumnOrEqual',
      column: 'colNum1' as unknown as SUniversalPColumnId,
      rhs: 'colNum2' as unknown as SUniversalPColumnId,
    };
    const result = convertFilterUiToExpressions(uiFilter);
    expect(result as any).toEqual({
      type: 'le',
      lhs: { type: 'col', name: 'colNum1' },
      rhs: { type: 'col', name: 'colNum2' },
    });
  });

  it('should compile "lessThanColumnOrEqual" filter with minDiff to ptabler expression', () => {
    const uiFilter: FilterSpec = {
      type: 'lessThanColumnOrEqual',
      column: 'colNum1' as unknown as SUniversalPColumnId,
      rhs: 'colNum2' as unknown as SUniversalPColumnId,
      minDiff: 3,
    };
    const result = convertFilterUiToExpressions(uiFilter);
    expect(result as any).toEqual({
      type: 'le',
      lhs: {
        type: 'plus',
        lhs: { type: 'col', name: 'colNum1' },
        rhs: { type: 'const', value: 3 },
      },
      rhs: { type: 'col', name: 'colNum2' },
    });
  });

  it('should compile "topN" filter to ptabler expression', () => {
    const uiFilter: FilterSpec = { type: 'topN', column: 'colNum' as unknown as SUniversalPColumnId, n: 5 };
    const result = convertFilterUiToExpressions(uiFilter);
    expect(result as any).toEqual({
      type: 'le',
      lhs: {
        type: 'rank',
        orderBy: [{ type: 'col', name: 'colNum' }],
        partitionBy: [],
        descending: true,
      },
      rhs: { type: 'const', value: 5 },
    });
  });

  it('should compile "bottomN" filter to ptabler expression', () => {
    const uiFilter: FilterSpec = { type: 'bottomN', column: 'colNum' as unknown as SUniversalPColumnId, n: 3 };
    const result = convertFilterUiToExpressions(uiFilter);
    expect(result as any).toEqual({
      type: 'le',
      lhs: {
        type: 'rank',
        orderBy: [{ type: 'col', name: 'colNum' }],
        partitionBy: [],
        descending: undefined, // ptabler-js sets descending to undefined when false
      },
      rhs: { type: 'const', value: 3 },
    });
  });

  it('should compile nested filters to ptabler expressions', () => {
    const uiFilter: FilterSpec = {
      type: 'and',
      filters: [
        {
          type: 'or',
          filters: [
            { type: 'isNA', column: 'colA' as unknown as SUniversalPColumnId },
            { type: 'patternEquals', column: 'colB' as unknown as SUniversalPColumnId, value: 'test' },
          ],
        },
        { type: 'greaterThan', column: 'colNum' as unknown as SUniversalPColumnId, x: 10 },
      ],
    };
    const result = convertFilterUiToExpressions(uiFilter);
    expect(result.type).toBe('and');
    expect((result as any).operands).toHaveLength(2);
    expect((result as any).operands[0].type).toBe('or');
    expect((result as any).operands[0].operands).toHaveLength(2);
    expect((result as any).operands[1].type).toBe('gt');
  });

  it('should throw error for OR filter with no operands', () => {
    const uiFilter: FilterSpec = { type: 'or', filters: [] };
    expect(() => convertFilterUiToExpressions(uiFilter)).toThrow('OR filter requires at least one operand');
  });

  it('should throw error for AND filter with no operands', () => {
    const uiFilter: FilterSpec = { type: 'and', filters: [] };
    expect(() => convertFilterUiToExpressions(uiFilter)).toThrow('AND filter requires at least one operand');
  });

  it('should throw error for undefined filter type', () => {
    const uiFilter: FilterSpec = { type: undefined };
    expect(() => convertFilterUiToExpressions(uiFilter)).toThrow('Filter type is undefined, this should not happen');
  });
});
