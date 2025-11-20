import type { AxisId, AxisSpec, CanonicalizedJson, FilterSpec, FilterSpecLeaf, FilterSpecType, PColumnSpec, SUniversalPColumnId } from '@platforma-sdk/model';

export type Operand = 'or' | 'and';

export type PlAdvancedFilterColumnId = SUniversalPColumnId | CanonicalizedJson<AxisId>;

export type FilterLeafContent = Extract<FilterSpecLeaf<PlAdvancedFilterColumnId>, { type: SupportedFilterTypes }>;
export type CommonFilter = FilterSpec<FilterLeafContent, { id: number; isExpanded?: boolean }>;
export type FilterLeaf = Exclude<CommonFilter, { type: Operand | 'not' }>;
export type NodeFilter = Extract<CommonFilter, { type: Operand | 'not' }>;
export type RootFilter = Omit<Extract<NodeFilter, { type: Operand }>, 'filters'> & { filters: NodeFilter[] };

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

type RequireFields<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;
type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

type NumericalWithOptionalX = 'lessThan' | 'lessThanOrEqual' | 'greaterThan' | 'greaterThanOrEqual' | 'equal' | 'notEqual';
type StringWithOptionalValue = 'patternEquals' | 'patternNotEquals';
// types from ui with some changed by optionality fields
type EditedTypes = 'patternFuzzyContainSubsequence' | NumericalWithOptionalX | StringWithOptionalValue;
export type EditableFilter = Exclude<FilterLeafContent, { type: EditedTypes }> |
  RequireFields<Extract<FilterLeafContent, { type: 'patternFuzzyContainSubsequence' }>, 'maxEdits' | 'substitutionsOnly'> |
  OptionalFields<Extract<FilterLeafContent, { type: NumericalWithOptionalX }>, 'x'> |
  OptionalFields<Extract<FilterLeafContent, { type: StringWithOptionalValue }>, 'value'>
;

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
