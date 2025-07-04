import type { SUniversalPColumnId } from '@milaboratories/pl-model-common';
import type { SimplifiedPColumnSpec } from './types';
import type { AnnotationFilter, AnnotationScript, AnnotationMode, PatternPredicate, IsNA, NotFilter, PatternFilter, NumericalComparisonFilter, ValueRank } from './filter';

export function unreachable(x: never): never {
  // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
  throw new Error('Unexpected object: ' + x);
}

function isNumericValueType(spec: SimplifiedPColumnSpec): boolean {
  return spec.valueType === 'Int' || spec.valueType === 'Long' || spec.valueType === 'Float' || spec.valueType === 'Double';
}

function isStringValueType(spec: SimplifiedPColumnSpec): boolean {
  return spec.valueType === 'String';
}

// const isUniversalPColumnId = (x: unknown): x is SUniversalPColumnId => typeof x === 'string';

// const isTransformedColumn = (x: unknown): x is TransformedColumn => typeof x === 'object' && x !== null && 'transformer' in x;

// const isUniversalPColumnIdOrTransformedColumn = (x: unknown): x is SUniversalPColumnId | TransformedColumn => isUniversalPColumnId(x) || isTransformedColumn(x);

// Define recursive type explicitly
export type FilterUi = { id?: number; isExpanded?: boolean }
  & ({ type: undefined }
    | { type: 'or'; filters: FilterUi[] }
    | { type: 'and'; filters: FilterUi[] }
    | { type: 'not'; filter: FilterUi }
    | { type: 'isNA'; column: SUniversalPColumnId }
    | { type: 'isNotNA'; column: SUniversalPColumnId }
    | { type: 'patternEquals'; column: SUniversalPColumnId; value: string }
    | { type: 'patternNotEquals'; column: SUniversalPColumnId; value: string }
    | { type: 'patternContainSubsequence'; column: SUniversalPColumnId; value: string }
    | { type: 'patternNotContainSubsequence'; column: SUniversalPColumnId; value: string }
    | { type: 'topN'; column: SUniversalPColumnId; n: number }
    | { type: 'bottomN'; column: SUniversalPColumnId; n: number }
    | { type: 'lessThan'; column: SUniversalPColumnId; x: number }
    | { type: 'greaterThan'; column: SUniversalPColumnId; x: number }
    | { type: 'lessThanOrEqual'; column: SUniversalPColumnId; x: number }
    | { type: 'greaterThanOrEqual'; column: SUniversalPColumnId; x: number }
    | { type: 'lessThanColumn'; column: SUniversalPColumnId; rhs: SUniversalPColumnId; minDiff?: number }
    | { type: 'lessThanColumnOrEqual'; column: SUniversalPColumnId; rhs: SUniversalPColumnId; minDiff?: number });

export type FilterUiType = Exclude<FilterUi, { type: undefined }>['type'];

export type FilterUiOfType<T extends FilterUiType> = Extract<FilterUi, { type: T }>;

export type TypeToLiteral<T> =
[T] extends [FilterUiType] ? 'FilterUiType' :
    [T] extends [SUniversalPColumnId] ? 'SUniversalPColumnId' :
        [T] extends [PatternPredicate] ? 'PatternPredicate' :
            [T] extends [AnnotationFilter[]] ? 'AnnotationFilter[]' :
                [T] extends [AnnotationFilter] ? 'AnnotationFilter' :
                    [T] extends [number] ? 'number' :
                        [T] extends [number | undefined] ? 'number?' :
                            [T] extends [string] ? 'string' :
                                [T] extends [string | undefined] ? 'string?' :
                                    [T] extends [boolean] ? 'boolean' :
                                        [T] extends [boolean | undefined] ? 'boolean?' :
                                            [T] extends [unknown[]] ? 'unknown[]' :
                                            // this is special
                                              T extends number ? 'number' :
                                                T extends string ? 'string' :
                                                  T extends boolean ? 'boolean' :
                                                    T extends Record<string, unknown> ? 'form' :
                                                      'unknown';

// @TODO: "parse" option
export type TypeField<V> = {
  fieldType: TypeToLiteral<V>;
  label: string;
  defaultValue: () => V | undefined;
};

export type TypeFieldRecord<T> = { [K in keyof T]: TypeField<T[K]>; };

export type TypeForm<T> = {
  [P in keyof T]: T[P] extends Record<string, unknown> ? {
    fieldType: 'form';
    label?: string;
    form?: T[P] extends Record<string, unknown> ? TypeForm<T[P]> : undefined;
    defaultValue: () => T[P];
  } : TypeField<T[P]>;
};

export type FormField =
  {
    fieldType: 'form';
    form?: Record<string, FormField>;
    defaultValue: () => Record<string, unknown>;
  }
  | TypeField<FilterUiType>
  | TypeField<string>
  | TypeField<number>
  | TypeField<number | undefined>
  | TypeField<boolean>
  | TypeField<boolean | undefined>
  | TypeField<SUniversalPColumnId>;

export type AnyForm = Record<string, FormField>;

type CreateFilterUiMetadataMap<T extends FilterUiType> = {
  [P in T]: {
    label: string;
    form: TypeForm<FilterUiOfType<T>>; // TODO: simplify this to `TypeField<T>`
    supportedFor: (spec1: SimplifiedPColumnSpec, spec2: SimplifiedPColumnSpec | undefined) => boolean;
  }
};

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
        label: 'Filters',
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
        label: 'Filters',
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
        defaultValue: () => undefined as unknown as FilterUi, // TODO:
      },
    },
    supportedFor: () => false,
  },
} satisfies CreateFilterUiMetadataMap<FilterUiType>;

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

export function compileFilter(ui: FilterUi): AnnotationFilter {
  if (ui.type === 'or') {
    return {
      type: 'or' as const,
      filters: compileFilters(ui.filters),
    };
  }

  if (ui.type === 'and') {
    return {
      type: 'and' as const,
      filters: compileFilters(ui.filters),
    };
  }

  if (ui.type === 'not') {
    return {
      type: 'not' as const,
      filter: compileFilter(ui.filter),
    };
  }

  if (ui.type === 'isNA') {
    return {
      type: 'isNA' as const,
      column: ui.column,
    };
  }

  if (ui.type === 'isNotNA') {
    const isNAFilter: IsNA = { type: 'isNA', column: ui.column };
    const notFilter: NotFilter = { type: 'not', filter: isNAFilter };
    return notFilter;
  }

  if (ui.type === 'patternEquals') {
    return {
      type: 'pattern' as const,
      column: ui.column,
      predicate: {
        type: 'equals' as const,
        value: ui.value,
      },
    };
  }

  if (ui.type === 'patternNotEquals') {
    const patternFilter: PatternFilter = {
      type: 'pattern',
      column: ui.column,
      predicate: { type: 'equals', value: ui.value },
    };
    const notFilter: NotFilter = { type: 'not', filter: patternFilter };
    return notFilter;
  }

  if (ui.type === 'patternContainSubsequence') {
    return {
      type: 'pattern' as const,
      column: ui.column,
      predicate: {
        type: 'containSubsequence' as const,
        value: ui.value,
      },
    };
  }

  if (ui.type === 'patternNotContainSubsequence') {
    const patternFilter: PatternFilter = {
      type: 'pattern',
      column: ui.column,
      predicate: { type: 'containSubsequence', value: ui.value },
    };
    const notFilter: NotFilter = { type: 'not', filter: patternFilter };
    return notFilter;
  }

  if (ui.type === 'topN') {
    const rankTransform: ValueRank = {
      transformer: 'rank',
      column: ui.column,
      descending: true,
    };
    const comparisonFilter: NumericalComparisonFilter = {
      type: 'numericalComparison',
      lhs: rankTransform,
      rhs: ui.n,
      allowEqual: true,
    };
    return comparisonFilter;
  }

  if (ui.type === 'bottomN') {
    const rankTransform: ValueRank = {
      transformer: 'rank',
      column: ui.column,
    };
    const comparisonFilter: NumericalComparisonFilter = {
      type: 'numericalComparison',
      lhs: rankTransform,
      rhs: ui.n,
      allowEqual: true,
    };
    return comparisonFilter;
  }

  if (ui.type === 'lessThan') {
    return {
      type: 'numericalComparison' as const,
      lhs: ui.column,
      rhs: ui.x,
    };
  }

  if (ui.type === 'greaterThan') {
    return {
      type: 'numericalComparison' as const,
      rhs: ui.column,
      lhs: ui.x,
    };
  }

  if (ui.type === 'greaterThanOrEqual') {
    return {
      type: 'numericalComparison' as const,
      rhs: ui.column,
      lhs: ui.x,
      allowEqual: true,
    };
  }

  if (ui.type === 'lessThanOrEqual') {
    return {
      type: 'numericalComparison' as const,
      lhs: ui.column,
      rhs: ui.x,
      allowEqual: true,
    };
  }

  if (ui.type === 'lessThanColumn') {
    return {
      type: 'numericalComparison' as const,
      lhs: ui.column,
      rhs: ui.rhs,
      minDiff: ui.minDiff,
      allowEqual: undefined,
    };
  }

  if (ui.type === 'lessThanColumnOrEqual') {
    return {
      type: 'numericalComparison' as const,
      lhs: ui.column,
      rhs: ui.rhs,
      minDiff: ui.minDiff,
      allowEqual: true,
    };
  }

  if (ui.type === undefined) {
    throw new Error('Filter type is undefined, this should not happen');
  }

  unreachable(ui);
}

export function compileFilters(uiFilters: FilterUi[]): AnnotationFilter[] {
  return uiFilters.filter((f) => f.type !== undefined).map(compileFilter);
}

export type AnnotationStepUi = {
  id?: number;
  label: string;
  filter: Extract<FilterUi, { type: 'and' | 'or' }>;
};

export type AnnotationScriptUi = {
  title: string;
  mode: AnnotationMode;
  steps: AnnotationStepUi[];
};

export function compileAnnotationScript(uiScript: AnnotationScriptUi): AnnotationScript {
  return {
    title: uiScript.title,
    mode: uiScript.mode,
    steps: uiScript.steps
      .filter((step) => {
        // No need to compile empty steps
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
      .map((step) => ({
        label: step.label.trim(),
        filter: compileFilter(step.filter),
      })),
  };
}
