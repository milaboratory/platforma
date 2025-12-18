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

const allowedSymbolsPattern = /^[a-zA-Z0-9\s!@#$%^*()_+\-=[\]{}|;:'",.?]*$/;
export function validateTitle(v: string) {
  if (!allowedSymbolsPattern.test(v)) {
    throw Error(`Title contains forbidden symbols`);
  }
}
