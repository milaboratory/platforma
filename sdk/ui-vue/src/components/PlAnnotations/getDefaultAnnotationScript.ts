import type { AnnotationScriptUi } from '@platforma-sdk/model';

export function getDefaultAnnotationScript(): AnnotationScriptUi {
  return {
    title: 'My Annotation',
    mode: 'byClonotype',
    steps: [],
  };
}
