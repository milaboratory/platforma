import type { FilterSpecType, SimplifiedPColumnSpec } from "@platforma-sdk/model";
import type { FilterSpecMetadataRecord } from "./types";

export const filterUiMetadata = {
  equal: {
    label: "Col = X (Equal)",
    form: {
      column: {
        label: "Column",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
      type: {
        label: "Predicate",
        fieldType: "FilterType",
        defaultValue: () => "equal",
      },
      x: {
        label: "X",
        fieldType: "number",
        defaultValue: () => 0,
      },
    },
    supportedFor: isNumericValueType,
  },
  notEqual: {
    label: "Col ≠ X (Not Equal)",
    form: {
      column: {
        label: "Column",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
      type: {
        label: "Predicate",
        fieldType: "FilterType",
        defaultValue: () => "notEqual",
      },
      x: {
        label: "X",
        fieldType: "number",
        defaultValue: () => 0,
      },
    },
    supportedFor: isNumericValueType,
  },
  lessThan: {
    label: "Col < X (Less Than)",
    form: {
      column: {
        label: "Column",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
      type: {
        label: "Predicate",
        fieldType: "FilterType",
        defaultValue: () => "lessThan",
      },
      x: {
        label: "X",
        fieldType: "number",
        defaultValue: () => 0,
      },
    },
    supportedFor: isNumericValueType,
  },
  greaterThan: {
    label: "Col > X (Greater Than)",
    form: {
      column: {
        label: "Column",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
      type: {
        label: "Predicate",
        fieldType: "FilterType",
        defaultValue: () => "greaterThan",
      },
      x: {
        label: "X",
        fieldType: "number",
        defaultValue: () => 0,
      },
    },
    supportedFor: isNumericValueType,
  },
  lessThanOrEqual: {
    label: "Col ≤ X (Less Than or Equal)",
    form: {
      column: {
        label: "Column",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
      type: {
        label: "Predicate",
        fieldType: "FilterType",
        defaultValue: () => "lessThanOrEqual",
      },
      x: {
        label: "X",
        fieldType: "number",
        defaultValue: () => 0,
      },
    },
    supportedFor: isNumericValueType,
  },
  greaterThanOrEqual: {
    label: "Col ≥ X (Greater Than or Equal)",
    form: {
      column: {
        label: "Column",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
      type: {
        label: "Predicate",
        fieldType: "FilterType",
        defaultValue: () => "greaterThanOrEqual",
      },
      x: {
        label: "X",
        fieldType: "number",
        defaultValue: () => 0,
      },
    },
    supportedFor: isNumericValueType,
  },
  // Columns comparison
  equalToColumn: {
    label: "Col₁ = Col₂ (Compare Columns)",
    form: {
      column: {
        label: "Col₁",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
      type: {
        label: "Predicate",
        fieldType: "FilterType",
        defaultValue: () => "equalToColumn",
      },
      rhs: {
        label: "Col₂",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
    },
    supportedFor: (spec1: SimplifiedPColumnSpec, spec2?: SimplifiedPColumnSpec): boolean => {
      return isNumericValueType(spec1) && (spec2 === undefined || isNumericValueType(spec2));
    },
  },
  lessThanColumn: {
    label: "Col₁ < Col₂ (Compare Columns)",
    form: {
      column: {
        label: "Col₁",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
      type: {
        label: "Predicate",
        fieldType: "FilterType",
        defaultValue: () => "lessThanColumn",
      },
      rhs: {
        label: "Col₂",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
      minDiff: {
        label: "Margin (positive)",
        fieldType: "number?",
        defaultValue: () => undefined,
      },
    },
    supportedFor: (spec1: SimplifiedPColumnSpec, spec2?: SimplifiedPColumnSpec): boolean => {
      return isNumericValueType(spec1) && (spec2 === undefined || isNumericValueType(spec2));
    },
  },
  greaterThanColumn: {
    label: "Col₁ > Col₂ (Compare Columns)",
    form: {
      column: {
        label: "Col₁",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
      type: {
        label: "Predicate",
        fieldType: "FilterType",
        defaultValue: () => "greaterThanColumn",
      },
      rhs: {
        label: "Col₂",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
      minDiff: {
        label: "Margin (positive)",
        fieldType: "number?",
        defaultValue: () => undefined,
      },
    },
    supportedFor: (spec1: SimplifiedPColumnSpec, spec2?: SimplifiedPColumnSpec): boolean => {
      return isNumericValueType(spec1) && (spec2 === undefined || isNumericValueType(spec2));
    },
  },
  lessThanColumnOrEqual: {
    label: "Col₁ ≤ Col₂ (Compare Columns)",
    form: {
      column: {
        label: "Col₁",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
      type: {
        label: "Predicate",
        fieldType: "FilterType",
        defaultValue: () => "lessThanColumnOrEqual",
      },
      rhs: {
        label: "Col₂",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
      minDiff: {
        label: "Margin (positive)",
        fieldType: "number?",
        defaultValue: () => undefined,
      },
    },
    supportedFor: (spec1: SimplifiedPColumnSpec, spec2?: SimplifiedPColumnSpec): boolean => {
      return isNumericValueType(spec1) && (spec2 === undefined || isNumericValueType(spec2));
    },
  },
  greaterThanColumnOrEqual: {
    label: "Col₁ ≥ Col₂ (Compare Columns)",
    form: {
      column: {
        label: "Col₁",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
      type: {
        label: "Predicate",
        fieldType: "FilterType",
        defaultValue: () => "greaterThanColumnOrEqual",
      },
      rhs: {
        label: "Col₂",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
      minDiff: {
        label: "Margin (positive)",
        fieldType: "number?",
        defaultValue: () => undefined,
      },
    },
    supportedFor: (spec1: SimplifiedPColumnSpec, spec2?: SimplifiedPColumnSpec): boolean => {
      return isNumericValueType(spec1) && (spec2 === undefined || isNumericValueType(spec2));
    },
  },
  // Ordering filters
  topN: {
    label: "Top N",
    form: {
      column: {
        label: "Rank By Column",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
      type: {
        label: "Predicate",
        fieldType: "FilterType",
        defaultValue: () => "topN",
      },
      n: {
        label: "N",
        fieldType: "number",
        defaultValue: () => 10,
      },
    },
    supportedFor: isNumericValueType,
  },
  bottomN: {
    label: "Bottom N",
    form: {
      column: {
        label: "Rank By Column",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
      type: {
        label: "Predicate",
        fieldType: "FilterType",
        defaultValue: () => "bottomN",
      },
      n: {
        label: "N",
        fieldType: "number",
        defaultValue: () => 10,
      },
    },
    supportedFor: isNumericValueType,
  },
  patternContainSubsequence: {
    label: "Col ~ Seq (Contain Subsequence)",
    form: {
      column: {
        label: "Column",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
      type: {
        label: "Predicate",
        fieldType: "FilterType",
        defaultValue: () => "patternContainSubsequence",
      },
      value: {
        label: "Seq",
        fieldType: "string",
        defaultValue: () => "",
      },
    },
    supportedFor: isStringValueType,
  },
  patternNotContainSubsequence: {
    label: "Col ≁ Seq (Not Contain Subsequence)",
    form: {
      column: {
        label: "Column",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
      type: {
        label: "Predicate",
        fieldType: "FilterType",
        defaultValue: () => "patternNotContainSubsequence",
      },
      value: {
        label: "Seq",
        fieldType: "string",
        defaultValue: () => "",
      },
    },
    supportedFor: isStringValueType,
  },
  patternEquals: {
    label: "Col = Seq (Equals)",
    form: {
      column: {
        label: "Column",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
      type: {
        label: "Predicate",
        fieldType: "FilterType",
        defaultValue: () => "patternEquals",
      },
      value: {
        label: "Seq",
        fieldType: "string",
        defaultValue: () => "",
      },
    },
    supportedFor: isStringValueType,
  },
  patternNotEquals: {
    label: "Col ≠ Seq (Not Equal)",
    form: {
      column: {
        label: "Column",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
      type: {
        label: "Predicate",
        fieldType: "FilterType",
        defaultValue: () => "patternNotEquals",
      },
      value: {
        label: "Seq",
        fieldType: "string",
        defaultValue: () => "",
      },
    },
    supportedFor: isStringValueType,
  },
  isNA: {
    label: "Is NA",
    form: {
      column: {
        label: "Column",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
      type: {
        label: "Predicate",
        fieldType: "FilterType",
        defaultValue: () => "isNA",
      },
    },
    supportedFor: () => true,
  },
  isNotNA: {
    label: "Is Not NA",
    form: {
      column: {
        label: "Column",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
      type: {
        label: "Predicate",
        fieldType: "FilterType",
        defaultValue: () => "isNotNA",
      },
    },
    supportedFor: () => true,
  },
  or: {
    label: "Or",
    form: {
      type: {
        fieldType: "FilterType",
        label: "Predicate",
        defaultValue: () => "or",
      },
      filters: {
        fieldType: "unknown[]",
        label: "Filters",
        defaultValue: () => [],
      },
    },
    supportedFor: () => false,
  },
  and: {
    label: "And",
    form: {
      type: {
        fieldType: "FilterType",
        label: "Predicate",
        defaultValue: () => "and",
      },
      filters: {
        fieldType: "unknown[]",
        label: "Filters",
        defaultValue: () => [],
      },
    },
    supportedFor: () => false,
  },
  not: {
    label: "Not",
    form: {
      type: {
        fieldType: "FilterType",
        label: "Predicate",
        defaultValue: () => "not",
      },
      filter: {
        fieldType: "form",
        label: "Filter",
        defaultValue: () => undefined,
      },
    },
    supportedFor: () => false,
  },
  patternMatchesRegularExpression: {
    label: "Col ~ X (Matches Regular Expression)",
    form: {
      column: {
        label: "Column",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
      type: {
        label: "Predicate",
        fieldType: "FilterType",
        defaultValue: () => "patternMatchesRegularExpression",
      },
      value: {
        label: "Seq",
        fieldType: "string",
        defaultValue: () => "",
      },
    },
    supportedFor: isStringValueType,
  },
  patternFuzzyContainSubsequence: {
    label: "Col ~ Seq (Fuzzy Contain Subsequence)",
    form: {
      column: {
        label: "Column",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
      type: {
        label: "Predicate",
        fieldType: "FilterType",
        defaultValue: () => "patternFuzzyContainSubsequence",
      },
      value: {
        label: "Set",
        fieldType: "string",
        defaultValue: () => "",
      },
    },
    supportedFor: isStringValueType,
  },
  inSet: {
    label: "Col ∈ Set (In Set)",
    form: {
      column: {
        label: "Column",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
      type: {
        label: "Predicate",
        fieldType: "FilterType",
        defaultValue: () => "inSet",
      },
      value: {
        fieldType: "unknown[]",
        label: "Set",
        defaultValue: () => [],
      },
    },
    supportedFor: isStringValueType,
  },
  notInSet: {
    label: "Col ∉ Set (Not In Set)",
    form: {
      column: {
        label: "Column",
        fieldType: "SUniversalPColumnId",
        defaultValue: () => undefined,
      },
      type: {
        label: "Predicate",
        fieldType: "FilterType",
        defaultValue: () => "notInSet",
      },
      value: {
        label: "Seq",
        fieldType: "unknown[]",
        defaultValue: () => [],
      },
    },
    supportedFor: isStringValueType,
  },
} satisfies FilterSpecMetadataRecord<FilterSpecType>;

export function getFilterUiTypeOptions(columnSpec?: SimplifiedPColumnSpec) {
  if (!columnSpec) {
    return [];
  }

  return Object.entries(filterUiMetadata)
    .filter(([_, metadata]) => metadata.supportedFor(columnSpec))
    .map(([type, metadata]) => ({
      label: metadata.label,
      value: type,
    }));
}

export function getFilterUiMetadata(type: FilterSpecType) {
  return filterUiMetadata[type];
}

function isNumericValueType(spec: SimplifiedPColumnSpec): boolean {
  return (
    spec.valueType === "Int" ||
    spec.valueType === "Long" ||
    spec.valueType === "Float" ||
    spec.valueType === "Double"
  );
}

function isStringValueType(spec: SimplifiedPColumnSpec): boolean {
  return spec.valueType === "String";
}
