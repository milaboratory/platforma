import type { AxisSpec, FilterUi, ListOptionBase, PColumnSpec, SUniversalPColumnId } from '@platforma-sdk/model';

// Not supported: topN, bottomN, lessThanColumn, lessThanColumnOrEqual
// or, and, not - in groups
export type SupportedFilterTypes = FilterUi['type'] &
  'isNA' | 'isNotNA' |
  'patternEquals' | 'patternNotEquals' |
  'patternContainSubsequence' | 'patternNotContainSubsequence' |
  'patternMatchesRegularExpression' |
  'patternFuzzyContainSubsequence' |
  'numberEquals' | 'numberNotEquals' |
  'lessThan' | 'lessThanOrEqual' |
  'greaterThan' | 'greaterThanOrEqual';

export type FilterType = SupportedFilterTypes | 'inSet' | 'notInSet';

export type Operand = 'or' | 'and';

type FilterUiBase = Exclude<FilterUi, 'id' | 'name' | 'isExpanded'> & {
  type: SupportedFilterTypes;
  column: SUniversalPColumnId;
};

type RequireFields<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;
type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

type NumericalWithOptionalX = 'lessThan' | 'lessThanOrEqual' | 'greaterThan' | 'greaterThanOrEqual' | 'numberEquals' | 'numberNotEquals';
type EditedTypes = 'patternFuzzyContainSubsequence' | NumericalWithOptionalX;
export type Filter =
  Exclude<FilterUiBase, { type: EditedTypes }> |
  RequireFields<Extract<FilterUiBase, { type: 'patternFuzzyContainSubsequence' }>, 'maxEdits' | 'substitutionsOnly'> |
  OptionalFields<Extract<FilterUiBase, { type: NumericalWithOptionalX }>, 'x'> |
  { type: 'inSet'; column: SUniversalPColumnId; value: string[] } |
  { type: 'notInSet'; column: SUniversalPColumnId;value: string[] };

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
