import { when } from '@milaboratories/ptabler-expression-js';
import type { FilterSpec } from '../filters';
import { convertFilterUiToExpressionImpl } from '../filters/converter';
import type { ExpressionSpec, FilterSpecUi } from './types';

function filterPredicate(item: FilterSpec): boolean {
  // No need to convert empty steps
  if (item.type == null) {
    return false;
  }

  if (item.type === 'or') {
    return item.filters.length > 0;
  }

  if (item.type === 'and') {
    return item.filters.length > 0;
  }

  if (item.type === 'not') {
    return filterPredicate(item.filter);
  }

  // Filter out any item that has undefined values in required fields
  return !Object.values(item).some((v) => v === undefined);
}

function filterEmptyPeaces(item: FilterSpec): FilterSpec {
  if (item.type === 'or' || item.type === 'and') {
    const filtered = item.filters
      .map(filterEmptyPeaces)
      .filter(filterPredicate);
    return {
      ...item,
      filters: filtered,
    };
  }

  return item;
}

export function convertFilterSpecsToExpressionSpecs(annotationsUI: FilterSpecUi[]): ExpressionSpec[] {
  const validAnnotationsUI = annotationsUI.map((step) => ({
    label: step.label,
    filter: filterEmptyPeaces(step.filter),
  }));
  return validAnnotationsUI
    .map((step): ExpressionSpec => ({
      type: 'alias',
      name: step.label.trim(),
      value: when(convertFilterUiToExpressionImpl(step.filter)).then(true).otherwise(false).toJSON(),
    }));
}
