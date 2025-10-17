import { when } from '@milaboratories/ptabler-expression-js';
import { convertFilterUiToExpressionImpl } from '../filters/converter';
import type { ExpressionSpec, FilterSpecUi } from './types';

export function convertFilterSpecsToExpressionSpecs(annotationsUI: FilterSpecUi[]): ExpressionSpec[] {
  return annotationsUI
    .filter((annotation) => {
      // No need to convert empty steps
      if (annotation.filter.type == null) {
        return false;
      }

      if (annotation.filter.type === 'or') {
        return annotation.filter.filters.length > 0;
      }

      if (annotation.filter.type === 'and') {
        return annotation.filter.filters.length > 0;
      }

      return false;
    })
    .map((step): ExpressionSpec => ({
      type: 'alias',
      name: step.label.trim(),
      value: when(convertFilterUiToExpressionImpl(step.filter)).then(true).otherwise(false).toJSON(),
    }));
}
