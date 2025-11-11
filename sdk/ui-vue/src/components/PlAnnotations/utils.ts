import type { FilterSpecTypeFieldRecord } from '@milaboratories/uikit';
import type { FilterSpecLeaf } from '@platforma-sdk/model';

export function createDefaultFilterMetadata<T extends FilterSpecLeaf>(): FilterSpecTypeFieldRecord<T> {
  return {
    column: {
      label: 'Column',
      fieldType: 'SUniversalPColumnId',
      defaultValue: () => undefined,
    },
    type: {
      label: 'Predicate',
      fieldType: 'FilterType',
      defaultValue: () => undefined,
    },
  } as FilterSpecTypeFieldRecord<T>;
};
