// eslint-disable-next-line vue/prefer-import-from-vue
import { enableTracking, pauseTracking, toRaw } from '@vue/reactivity';
import { isNil, randomInt } from '@milaboratories/helpers';
import type { AnnotationScriptUi, FilterUi, TypeFieldRecord } from '@platforma-sdk/model';

export function getDefaultAnnotationScript(): AnnotationScriptUi {
  return {
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

export function migratgeToWithId(items: { id?: number }[]) {
  pauseTracking();
  items = toRaw(items);

  for (let i = 0; i < items.length; i++) {
    if (isNil(items[i].id)) {
      items[i].id = randomInt();
    }
  }

  enableTracking();
}
