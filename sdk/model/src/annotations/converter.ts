import { convertFiltersUiToExpressions } from '../filters/converter';
import type { AnnotationScript, AnnotationScriptUI, AnnotationStep } from './types';

export function convertAnnotationScript(uiScript: AnnotationScriptUI): AnnotationScript {
  return {
    title: uiScript.title,
    steps: uiScript.steps
      .filter((step) => {
        // No need to convert empty steps
        if (step.filter.type == null) {
          return false;
        }

        if (step.filter.type === 'or') {
          return step.filter.filters.length > 0;
        }

        if (step.filter.type === 'and') {
          return step.filter.filters.length > 0;
        }

        return false;
      })
      .map((step): AnnotationStep => ({
        label: step.label.trim(),
        expression: convertFiltersUiToExpressions(step.filter),
      })),
  };
}
