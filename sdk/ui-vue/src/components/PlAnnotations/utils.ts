import type { FilterSpecTypeFieldRecord } from '@milaboratories/uikit';
import type { FilterSpec } from './types';

export function createDefaultFilterMetadata<T extends Extract<FilterSpec, { column: unknown }>>(): FilterSpecTypeFieldRecord<T> {
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
