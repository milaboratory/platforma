import type { AnnotationScript, AnnotationScriptUi } from '@platforma-sdk/model';
import { compileAnnotationScript } from '@platforma-sdk/model';
import { watchDebounced } from '@vueuse/core';
import { migratgeToWithId } from './utils';

export function annotationModelController(
  getArgsState: () => AnnotationScript,
  getUiState: () => AnnotationScriptUi,
) {
  migratgeToWithId(getUiState().steps);
  getUiState().steps.forEach((step) => migratgeToWithId(step.filter.filters));

  watchDebounced(getUiState, (value) => {
    try {
      Object.assign(getArgsState(), compileAnnotationScript(value));
    } catch (err) {
      console.error('Error while compiling annotation UI state to Args:', err);
    }
  }, { deep: true, debounce: 1000 });
}
