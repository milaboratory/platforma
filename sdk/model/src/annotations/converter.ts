import { convertFilterUiToExpressions } from '../filters/converter';
import type { AnnotationSpec, AnnotationSpecUi } from './types';

export function convertAnnotations(annotationsUI: AnnotationSpecUi[]): AnnotationSpec[] {
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
    .map((step): AnnotationSpec => ({
      label: step.label.trim(),
      expression: convertFilterUiToExpressions(step.filter),
    }));
}
