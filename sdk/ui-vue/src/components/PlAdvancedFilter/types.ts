import type { AxisSpec, FilterSpec, FilterSpecLeaf, FilterSpecType, ListOptionBase, PColumnSpec, SUniversalPColumnId } from '@platforma-sdk/model';
import { SUPPORTED_FILTER_TYPES } from './constants';
import type { CanonicalizedJson } from '@platforma-sdk/model';
import type { AxisId } from '@platforma-sdk/model';

export type ColumnId = SUniversalPColumnId | CanonicalizedJson<AxisId>;
export type CommonFilterSpec = FilterSpec<FilterSpecLeaf<ColumnId>, { expanded?: boolean }>;

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

type FilterUiBase = FilterSpecLeaf<ColumnId> & {
  type: SupportedFilterTypes;
  column: ColumnId;
};

type RequireFields<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;
type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

type NumericalWithOptionalX = 'lessThan' | 'lessThanOrEqual' | 'greaterThan' | 'greaterThanOrEqual' | 'equal' | 'notEqual';
type StringWithOptionalValue = 'patternEquals' | 'patternNotEquals';
type EditedTypes = SupportedFilterTypes & ('patternFuzzyContainSubsequence' | NumericalWithOptionalX | StringWithOptionalValue); // types from ui with some changed by optionality fields
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

export type UniqueValuesList = ListOptionBase<string | number>[];
export type OptionInfo = { error: boolean; label: string; spec: PColumnSpec | AxisSpec };
export type FixedAxisInfo = {
  idx: number;
  label: string;
};

export type SourceOptionInfo = {
  id: ColumnId;
  label: string;
  error: boolean;
  spec: PColumnSpec | AxisSpec;
  axesToBeFixed?: FixedAxisInfo[];
  alphabet?: 'nucleotide' | 'aminoacid' | string;
};
