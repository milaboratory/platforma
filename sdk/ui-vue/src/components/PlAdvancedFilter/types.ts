import type { AxisId, AxisSpec, CanonicalizedJson, FilterSpec, FilterSpecLeaf, FilterSpecType, PColumnSpec, SUniversalPColumnId } from '@platforma-sdk/model';
import { SUPPORTED_FILTER_TYPES } from './constants';

export type PlAdvancedFilterColumnId = SUniversalPColumnId | CanonicalizedJson<AxisId>;

export type FilterLeafContent = Extract<FilterSpecLeaf<PlAdvancedFilterColumnId>, { type: SupportedFilterTypes }>;
export type CommonFilter = FilterSpec<FilterLeafContent, { id: number; expanded?: boolean }>;
export type FilterLeaf = Exclude<CommonFilter, { type: 'and' | 'or' | 'not' }>;
export type NodeFilter = Extract<CommonFilter, { type: 'and' | 'or' | 'not' }>;

export type MiddleFilter = Omit<Extract<NodeFilter, { type: 'and' | 'or' }>, 'filters'> & { filters: NodeFilter[] };
export type RootFilter = Omit<Extract<NodeFilter, { type: 'or' | 'and' }>, 'filters'> & { filters: NodeFilter[] };

// Not supported: topN, bottomN, lessThanColumn, lessThanColumnOrEqual
// or, and, not - in groups
export type SupportedFilterTypes = FilterSpecType &
  'isNA' | 'isNotNA' |
  'patternEquals' | 'patternNotEquals' |
  'patternContainSubsequence' | 'patternNotContainSubsequence' |
  'patternMatchesRegularExpression' |
  'patternFuzzyContainSubsequence' |
  'inSet' | 'notInSet' |
  'equal' | 'notEqual' |
  'lessThan' | 'lessThanOrEqual' |
  'greaterThan' | 'greaterThanOrEqual';

export type FilterType = SupportedFilterTypes;

export function isSupportedFilterType(type: FilterSpecType | undefined): type is SupportedFilterTypes {
  if (!type) {
    return false;
  }
  return SUPPORTED_FILTER_TYPES.has(type as SupportedFilterTypes);
}

export type Operand = 'or' | 'and';

type FilterUiBase = FilterLeafContent;

type RequireFields<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;
type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

type NumericalWithOptionalX = 'lessThan' | 'lessThanOrEqual' | 'greaterThan' | 'greaterThanOrEqual' | 'equal' | 'notEqual';
type StringWithOptionalValue = 'patternEquals' | 'patternNotEquals';
// types from ui with some changed by optionality fields
type EditedTypes = 'patternFuzzyContainSubsequence' | NumericalWithOptionalX | StringWithOptionalValue;
export type Filter = Exclude<FilterUiBase, { type: EditedTypes }> |
  RequireFields<Extract<FilterUiBase, { type: 'patternFuzzyContainSubsequence' }>, 'maxEdits' | 'substitutionsOnly'> |
  OptionalFields<Extract<FilterUiBase, { type: NumericalWithOptionalX }>, 'x'> |
  OptionalFields<Extract<FilterUiBase, { type: StringWithOptionalValue }>, 'value'>
;

export type Group = {
  id: string;
  not: boolean;
  filters: Filter[];
  operand: Operand;
  expanded: boolean;
};

export type PlAdvancedFilterUI = {
  groups: Group[];
  operand: Operand;
};

export type FixedAxisInfo = {
  idx: number;
  label: string;
};

export type SourceOptionInfo = {
  id: PlAdvancedFilterColumnId;
  label: string;
  spec: PColumnSpec | AxisSpec;
  error?: boolean;
  alphabet?: 'nucleotide' | 'aminoacid' | string;
  axesToBeFixed?: FixedAxisInfo[];
};
