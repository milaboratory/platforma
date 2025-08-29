import type { FilterUiType, SimplifiedPColumnSpec } from '@platforma-sdk/model';
import type { FilterUiMetadataRecord } from './types';

export const filterUiMetadata = {
  lessThan: {
    label: 'Col < X (Less Than)',
    form: {
      column: {
        label: 'Column',
        fieldType: 'SUniversalPColumnId',
        defaultValue: () => undefined,
      },
      type: {
        label: 'Predicate',
        fieldType: 'FilterUiType',
        defaultValue: () => 'lessThan',
      },
      x: {
        label: 'X',
        fieldType: 'number',
        defaultValue: () => 0,
      },
    },
    supportedFor: isNumericValueType,
  },
  greaterThan: {
    label: 'Col > X (Greater Than)',
    form: {
      column: {
        label: 'Column',
        fieldType: 'SUniversalPColumnId',
        defaultValue: () => undefined,
      },
      type: {
        label: 'Predicate',
        fieldType: 'FilterUiType',
        defaultValue: () => 'greaterThan',
      },
      x: {
        label: 'X',
        fieldType: 'number',
        defaultValue: () => 0,
      },
    },
    supportedFor: isNumericValueType,
  },
  lessThanOrEqual: {
    label: 'Col ≤ X (Less Than or Equal)',
    form: {
      column: {
        label: 'Column',
        fieldType: 'SUniversalPColumnId',
        defaultValue: () => undefined,
      },
      type: {
        label: 'Predicate',
        fieldType: 'FilterUiType',
        defaultValue: () => 'lessThanOrEqual',
      },
      x: {
        label: 'X',
        fieldType: 'number',
        defaultValue: () => 0,
      },
    },
    supportedFor: isNumericValueType,
  },
  greaterThanOrEqual: {
    label: 'Col ≥ X (Greater Than or Equal)',
    form: {
      column: {
        label: 'Column',
        fieldType: 'SUniversalPColumnId',
        defaultValue: () => undefined,
      },
      type: {
        label: 'Predicate',
        fieldType: 'FilterUiType',
        defaultValue: () => 'greaterThanOrEqual',
      },
      x: {
        label: 'X',
        fieldType: 'number',
        defaultValue: () => 0,
      },
    },
    supportedFor: isNumericValueType,
  },
  lessThanColumn: {
    label: 'Col₁ < Col₂ (Compare Columns)',
    form: {
      column: {
        label: 'Col₁',
        fieldType: 'SUniversalPColumnId',
        defaultValue: () => undefined,
      },
      type: {
        label: 'Predicate',
        fieldType: 'FilterUiType',
        defaultValue: () => 'lessThanColumn',
      },
      rhs: {
        label: 'Col₂',
        fieldType: 'SUniversalPColumnId',
        defaultValue: () => undefined,
      },
      minDiff: {
        label: 'Margin (positive)',
        fieldType: 'number?',
        defaultValue: () => undefined,
      },
    },
    supportedFor: (spec1: SimplifiedPColumnSpec, spec2?: SimplifiedPColumnSpec): boolean => {
      return isNumericValueType(spec1) && (spec2 === undefined || isNumericValueType(spec2));
    },
  },
  lessThanColumnOrEqual: {
    label: 'Col₁ ≤ Col₂ (Compare Columns)',
    form: {
      column: {
        label: 'Col₁',
        fieldType: 'SUniversalPColumnId',
        defaultValue: () => undefined,
      },
      type: {
        label: 'Predicate',
        fieldType: 'FilterUiType',
        defaultValue: () => 'lessThanColumnOrEqual',
      },
      rhs: {
        label: 'Col₂',
        fieldType: 'SUniversalPColumnId',
        defaultValue: () => undefined,
      },
      minDiff: {
        label: 'Margin (positive)',
        fieldType: 'number?',
        defaultValue: () => undefined,
      },
    },
    supportedFor: (spec1: SimplifiedPColumnSpec, spec2?: SimplifiedPColumnSpec): boolean => {
      return isNumericValueType(spec1) && (spec2 === undefined || isNumericValueType(spec2));
    },
  },
  topN: {
    label: 'Top N',
    form: {
      column: {
        label: 'Rank By Column',
        fieldType: 'SUniversalPColumnId',
        defaultValue: () => undefined,
      },
      type: {
        label: 'Predicate',
        fieldType: 'FilterUiType',
        defaultValue: () => 'topN',
      },
      n: {
        label: 'N',
        fieldType: 'number',
        defaultValue: () => 10,
      },
    },
    supportedFor: isNumericValueType,
  },
  bottomN: {
    label: 'Bottom N',
    form: {
      column: {
        label: 'Rank By Column',
        fieldType: 'SUniversalPColumnId',
        defaultValue: () => undefined,
      },
      type: {
        label: 'Predicate',
        fieldType: 'FilterUiType',
        defaultValue: () => 'bottomN',
      },
      n: {
        label: 'N',
        fieldType: 'number',
        defaultValue: () => 10,
      },
    },
    supportedFor: isNumericValueType,
  },
  patternContainSubsequence: {
    label: 'Col ~ Seq (Contain Subsequence)',
    form: {
      column: {
        label: 'Column',
        fieldType: 'SUniversalPColumnId',
        defaultValue: () => undefined,
      },
      type: {
        label: 'Predicate',
        fieldType: 'FilterUiType',
        defaultValue: () => 'patternContainSubsequence',
      },
      value: {
        label: 'Seq',
        fieldType: 'string',
        defaultValue: () => '',
      },
    },
    supportedFor: isStringValueType,
  },
  patternNotContainSubsequence: {
    label: 'Col ≁ Seq (Not Contain Subsequence)',
    form: {
      column: {
        label: 'Column',
        fieldType: 'SUniversalPColumnId',
        defaultValue: () => undefined,
      },
      type: {
        label: 'Predicate',
        fieldType: 'FilterUiType',
        defaultValue: () => 'patternNotContainSubsequence',
      },
      value: {
        label: 'Seq',
        fieldType: 'string',
        defaultValue: () => '',
      },
    },
    supportedFor: isStringValueType,
  },
  patternEquals: {
    label: 'Col = Seq (Equals)',
    form: {
      column: {
        label: 'Column',
        fieldType: 'SUniversalPColumnId',
        defaultValue: () => undefined,
      },
      type: {
        label: 'Predicate',
        fieldType: 'FilterUiType',
        defaultValue: () => 'patternEquals',
      },
      value: {
        label: 'Seq',
        fieldType: 'string',
        defaultValue: () => '',
      },
    },
    supportedFor: isStringValueType,
  },
  patternNotEquals: {
    label: 'Col ≠ Seq (Not Equal)',
    form: {
      column: {
        label: 'Column',
        fieldType: 'SUniversalPColumnId',
        defaultValue: () => undefined,
      },
      type: {
        label: 'Predicate',
        fieldType: 'FilterUiType',
        defaultValue: () => 'patternNotEquals',
      },
      value: {
        label: 'Seq',
        fieldType: 'string',
        defaultValue: () => '',
      },
    },
    supportedFor: isStringValueType,
  },
  isNA: {
    label: 'Is NA',
    form: {
      column: {
        label: 'Column',
        fieldType: 'SUniversalPColumnId',
        defaultValue: () => undefined,
      },
      type: {
        label: 'Predicate',
        fieldType: 'FilterUiType',
        defaultValue: () => 'isNA',
      },
    },
    supportedFor: () => true,
  },
  isNotNA: {
    label: 'Is Not NA',
    form: {
      column: {
        label: 'Column',
        fieldType: 'SUniversalPColumnId',
        defaultValue: () => undefined,
      },
      type: {
        label: 'Predicate',
        fieldType: 'FilterUiType',
        defaultValue: () => 'isNotNA',
      },
    },
    supportedFor: () => true,
  },
  or: {
    label: 'Or',
    form: {
      type: {
        fieldType: 'FilterUiType',
        label: 'Predicate',
        defaultValue: () => 'or',
      },
      filters: {
        fieldType: 'unknown[]',
        label: 'Filter',
        defaultValue: () => [],
      },
    },
    supportedFor: () => false,
  },
  and: {
    label: 'And',
    form: {
      type: {
        fieldType: 'FilterUiType',
        label: 'Predicate',
        defaultValue: () => 'and',
      },
      filters: {
        fieldType: 'unknown[]',
        label: 'Filter',
        defaultValue: () => [],
      },
    },
    supportedFor: () => false,
  },
  not: {
    label: 'Not',
    form: {
      type: {
        fieldType: 'FilterUiType',
        label: 'Predicate',
        defaultValue: () => 'not',
      },
      filter: {
        fieldType: 'form',
        label: 'Filter',
        defaultValue: () => undefined,
      },
    },
    supportedFor: () => false,
  },
} satisfies FilterUiMetadataRecord<FilterUiType>;

export function getFilterUiTypeOptions(columnSpec?: SimplifiedPColumnSpec) {
  if (!columnSpec) {
    return [];
  }

  return Object.entries(filterUiMetadata).filter(([_, metadata]) => metadata.supportedFor(columnSpec)).map(([type, metadata]) => ({
    label: metadata.label,
    value: type,
  }));
}

export function getFilterUiMetadata(type: FilterUiType) {
  return filterUiMetadata[type];
}

function isNumericValueType(spec: SimplifiedPColumnSpec): boolean {
  return spec.valueType === 'Int' || spec.valueType === 'Long' || spec.valueType === 'Float' || spec.valueType === 'Double';
}

function isStringValueType(spec: SimplifiedPColumnSpec): boolean {
  return spec.valueType === 'String';
}
