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
type StringWithOptionalValue = 'patternEquals' | 'patternNotEquals';
type EditedTypes = 'patternFuzzyContainSubsequence' | NumericalWithOptionalX | StringWithOptionalValue; // types from ui with some changed by optionality fields
export type Filter =
  (Exclude<FilterUiBase, { type: EditedTypes }> |
    RequireFields<Extract<FilterUiBase, { type: 'patternFuzzyContainSubsequence' }>, 'maxEdits' | 'substitutionsOnly'> |
    OptionalFields<Extract<FilterUiBase, { type: NumericalWithOptionalX }>, 'x'> |
    OptionalFields<Extract<FilterUiBase, { type: StringWithOptionalValue }>, 'value'> |
    { type: 'inSet'; column: SUniversalPColumnId; value: string[] } |
    { type: 'notInSet'; column: SUniversalPColumnId; value: string[] }) & { fixedAxes: Record<string, string> };

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

export type UniqueValuesList = ListOptionBase<string | number>[];
export type OptionInfo = { error: boolean; label: string; spec: PColumnSpec | AxisSpec };
export type FixedAxisInfo = {
  id: string; // ?
  info: {
    label: string;
    spec: AxisSpec;
    uniqueValues: UniqueValuesList | null;
  };
};

export type SourceOptionInfo = {
  id: SUniversalPColumnId;
  info: {
    label: string;
    error: boolean;
    uniqueValues: UniqueValuesList | null;
    spec: PColumnSpec | AxisSpec;
    axesToBeFixed?: FixedAxisInfo[];
    alphabet?: 'nucleotide' | 'aminoacid' | string;
  };
};
