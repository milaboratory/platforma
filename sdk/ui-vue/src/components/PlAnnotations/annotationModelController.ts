import { watchDebounced } from '@vueuse/core';
import { compileAnnotationScript } from '@platforma-sdk/model';
import type { AnnotationScriptUi, AnnotationScript } from '@platforma-sdk/model';
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
      console.error(err);
    }
  }, { deep: true, debounce: 300 });
}
