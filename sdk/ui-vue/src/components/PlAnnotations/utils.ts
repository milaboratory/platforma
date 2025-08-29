import type { AnnotationScriptUi, FilterUi, TypeFieldRecord } from '@platforma-sdk/model';

export function getDefaultAnnotationScript(): AnnotationScriptUi {
  return {
    isCreated: false,
    title: 'My Annotation',
    mode: 'byClonotype',
    steps: [],
  };
}

export function createDefaultFilterMetadata<T extends Extract<FilterUi, { column: unknown }>>(): TypeFieldRecord<T> {
  return {
    column: {
      label: 'Column',
      fieldType: 'SUniversalPColumnId',
      defaultValue: () => undefined,
    },
    type: {
      label: 'Predicate',
      fieldType: 'FilterUiType',
      defaultValue: () => undefined,
    },
  } as TypeFieldRecord<T>;
};
