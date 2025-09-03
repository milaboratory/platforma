import type { AxisSpec, FilterUi, ListOptionBase, PColumnSpec } from '@platforma-sdk/model';

// Not supported: topN, bottomN, lessThanColumn, lessThanColumnOrEqual
// or, and, not - in groups
export type SupportedFilterTypes = Exclude<FilterUi['type'], 'topN' | 'bottomN' | 'lessThanColumn' | 'lessThanColumnOrEqual' | 'or' | 'and' | 'not' | undefined>;

export type FilterType = SupportedFilterTypes | 'InSet' | 'NotInSet';

export type Operand = 'or' | 'and';

interface FilterBase {
  type: FilterType;
  sourceId: string;
}
export interface IsNAFilter extends FilterBase {
  type: 'isNA';
};
export interface IsNotNAFilter extends FilterBase {
  type: 'isNotNA';
};
export interface StringEqualsFilter extends FilterBase {
  type: 'patternEquals';
  reference?: string;
};
export interface StringNotEqualsFilter extends FilterBase {
  type: 'patternNotEquals';
  reference?: string;
};
export interface InSetFilter extends FilterBase {
  type: 'InSet';
  reference: string[];
}
export interface NotInSetFilter extends FilterBase {
  type: 'NotInSet';
  reference: string[];
}
export interface GreaterFilter extends FilterBase {
  type: 'greaterThan';
  reference?: number;
};
export interface GreaterOrEqualFilter extends FilterBase {
  type: 'greaterThanOrEqual';
  reference?: number;
};
export interface LessFilter extends FilterBase {
  type: 'lessThan';
  reference?: number;
};
export interface LessOrEqualFilter extends FilterBase {
  type: 'lessThanOrEqual';
  reference?: number;
};
export interface StringContainsFilter extends FilterBase {
  type: 'patternContainSubsequence';
  substring: string;
}
export interface StringNotContainsFilter extends FilterBase {
  type: 'patternNotContainSubsequence';
  substring: string;
}
export interface NumberEqualsFilter extends FilterBase {
  type: 'numberEquals';
  reference?: number;
};
export interface NumberNotEqualsFilter extends FilterBase {
  type: 'numberNotEquals';
  reference?: number;
};
export interface StringContainsFuzzyFilter extends FilterBase {
  type: 'patternFuzzyContainSubsequence';
  reference: string;
  maxEdits: number;
  substitutionsOnly: boolean;
  wildcard?: string;
}
export interface StringMatches extends FilterBase {
  type: 'patternMatchesRegularExpression';
  reference: string;
}

export type Filter =
  IsNAFilter | IsNotNAFilter
  | StringEqualsFilter | StringNotEqualsFilter
  | NumberEqualsFilter | NumberNotEqualsFilter
  | InSetFilter | NotInSetFilter
  | GreaterFilter | GreaterOrEqualFilter
  | LessFilter | LessOrEqualFilter
  | StringContainsFilter | StringNotContainsFilter
  | StringContainsFuzzyFilter
  | StringMatches;

export type Group = {
  id: string;
  not: boolean;
  filters: Filter[];
  operand: Operand;
};

export type PlAdvancedFilterUI = {
  groups: Group[];
  operand: Operand;
};

export type OptionInfo = { error: boolean; label: string; spec: PColumnSpec | AxisSpec };
export type SourceOptionsInfo = Record<string, OptionInfo>;

export type UniqueValuesList = ListOptionBase<string | number>[];
export type UniqueValuesInfo = Record<string, UniqueValuesList>;
