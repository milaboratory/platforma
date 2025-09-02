import type { AxisSpec, PColumnSpec, ValueType } from '@platforma-sdk/model';

export type ModeOfEditing = 'drag-n-drop' | 'select';

export type FilterType =
  'IsNA'
  | 'IsNotNA'
  | 'Equal'
  | 'NotEqual'
  | 'InSet'
  | 'NotInSet'
  | 'Greater'
  | 'GreaterOrEqual'
  | 'Less'
  | 'LessOrEqual'
  | 'StringContains'
  | 'StringNotContains'
  | 'StringContainsFuzzy'
  | 'StringMatches';

export type Operand = 'or' | 'and';

interface FilterBase {
  type: FilterType;
  sourceId: string;
}
export interface IsNAFilter extends FilterBase {
  type: 'IsNA';
};
export interface IsNotNAFilter extends FilterBase {
  type: 'IsNotNA';
};
export interface EqualFilter extends FilterBase {
  type: 'Equal';
  reference?: string | number;
};
export interface NotEqualFilter extends FilterBase {
  type: 'NotEqual';
  reference?: string | number;
};
export interface InSetFilter extends FilterBase {
  type: 'InSet';
  reference: (string | number)[];
}
export interface NotInSetFilter extends FilterBase {
  type: 'NotInSet';
  reference: (string | number)[];
}
export interface GreaterFilter extends FilterBase {
  type: 'Greater';
  reference?: number;
};
export interface GreaterOrEqualFilter extends FilterBase {
  type: 'GreaterOrEqual';
  reference?: number;
};
export interface LessFilter extends FilterBase {
  type: 'Less';
  reference?: number;
};
export interface LessOrEqualFilter extends FilterBase {
  type: 'LessOrEqual';
  reference?: number;
};
export interface StringContainsFilter extends FilterBase {
  type: 'StringContains';
  substring: string;
}
export interface StringNotContainsFilter extends FilterBase {
  type: 'StringNotContains';
  substring: string;
}
export interface StringContainsFuzzyFilter extends FilterBase {
  type: 'StringContainsFuzzy';
  reference: string;
  maxEdits: number;
  substitutionsOnly: boolean;
  wildcard?: string;
}
export interface StringMatches extends FilterBase {
  type: 'StringMatches';
  reference: string;
}

export type Filter =
  IsNAFilter
  | IsNotNAFilter
  | EqualFilter
  | NotEqualFilter
  | InSetFilter
  | NotInSetFilter
  | GreaterFilter
  | GreaterOrEqualFilter
  | LessFilter
  | LessOrEqualFilter
  | StringContainsFilter
  | StringNotContainsFilter
  | StringContainsFuzzyFilter
  | StringMatches;

export type Group = {
  id: string;
  not: boolean;
  childIdxs: number[];
  filters: Filter[];
  operand: Operand;
};

export type ComplexFilter = {
  groups: Group[];
  operand: Operand;
};

export type OptionInfo = { error: boolean; label: string; type: ValueType; spec?: PColumnSpec | AxisSpec };
export type SourceOptionsInfo = Record<string, OptionInfo>;
