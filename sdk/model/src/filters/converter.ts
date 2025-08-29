import { and, col, lit, or, rank, type Expression, type ExpressionImpl } from '@milaboratories/ptabler-js';
import type { FilterUi } from '../filters';

export function convertFilterUiToExpressionImpl(ui: FilterUi): ExpressionImpl {
  if (ui.type === 'or') {
    const expressions = ui.filters.filter((f) => f.type !== undefined).map(convertFilterUiToExpressionImpl);
    if (expressions.length === 0) {
      throw new Error('OR filter requires at least one operand');
    }
    return or(...expressions);
  }

  if (ui.type === 'and') {
    const expressions = ui.filters.filter((f) => f.type !== undefined).map(convertFilterUiToExpressionImpl);
    if (expressions.length === 0) {
      throw new Error('AND filter requires at least one operand');
    }
    return and(...expressions);
  }

  if (ui.type === 'not') {
    return convertFilterUiToExpressionImpl(ui.filter).not();
  }

  if (ui.type === 'isNA') {
    return col(ui.column).isNull();
  }

  if (ui.type === 'isNotNA') {
    return col(ui.column).isNotNull();
  }

  if (ui.type === 'patternEquals') {
    return col(ui.column).eq(lit(ui.value));
  }

  if (ui.type === 'patternNotEquals') {
    return col(ui.column).neq(lit(ui.value));
  }

  if (ui.type === 'patternContainSubsequence') {
    return col(ui.column).strContains(ui.value, false, true);
  }

  if (ui.type === 'patternNotContainSubsequence') {
    return col(ui.column).strContains(ui.value, false, true).not();
  }

  if (ui.type === 'lessThan') {
    return col(ui.column).lt(lit(ui.x));
  }

  if (ui.type === 'greaterThan') {
    return col(ui.column).gt(lit(ui.x));
  }

  if (ui.type === 'lessThanOrEqual') {
    return col(ui.column).le(lit(ui.x));
  }

  if (ui.type === 'greaterThanOrEqual') {
    return col(ui.column).ge(lit(ui.x));
  }

  if (ui.type === 'lessThanColumn') {
    if (ui.minDiff !== undefined && ui.minDiff !== 0) {
      return col(ui.column).plus(lit(ui.minDiff)).lt(col(ui.rhs));
    }
    return col(ui.column).lt(col(ui.rhs));
  }

  if (ui.type === 'lessThanColumnOrEqual') {
    if (ui.minDiff !== undefined && ui.minDiff !== 0) {
      return col(ui.column).plus(lit(ui.minDiff)).le(col(ui.rhs));
    }
    return col(ui.column).le(col(ui.rhs));
  }

  if (ui.type === 'topN') {
    return rank(col(ui.column), true).over([]).le(lit(ui.n));
  }

  if (ui.type === 'bottomN') {
    return rank(col(ui.column), false).over([]).le(lit(ui.n));
  }

  if (ui.type === undefined) {
    throw new Error('Filter type is undefined, this should not happen');
  }

  throw new Error('Unhandled filter type');
}

export function convertFilterUiToExpressions(ui: FilterUi): Expression {
  return convertFilterUiToExpressionImpl(ui).toJSON();
}
