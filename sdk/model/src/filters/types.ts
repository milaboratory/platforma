import type { PColumnSpec, SUniversalPColumnId } from '@milaboratories/pl-model-common';

export type SimplifiedPColumnSpec = Pick<PColumnSpec, 'valueType' | 'annotations'>;

export type SimplifiedUniversalPColumnEntry = {
  id: SUniversalPColumnId;
  label: string;
  obj: SimplifiedPColumnSpec;
};

export type FilterSpecNode<Leaf, Common = {}> =
  | Common & Leaf
  | Common & { type: 'not'; filter: Common & Leaf }
  | Common & { type: 'or'; filters: FilterSpecNode<Leaf, Common>[] }
  | Common & { type: 'and'; filters: FilterSpecNode<Leaf, Common>[] };

export type FilterSpecLeaf<T = SUniversalPColumnId> =
  | { type: undefined }
  | { type: 'isNA'; column: T }
  | { type: 'isNotNA'; column: T }

  | { type: 'patternEquals'; column: T; value: string }
  | { type: 'patternNotEquals'; column: T; value: string }
  | { type: 'patternContainSubsequence'; column: T; value: string }
  | { type: 'patternNotContainSubsequence'; column: T; value: string }
  | { type: 'patternMatchesRegularExpression'; column: T; value: string }
  | { type: 'patternFuzzyContainSubsequence'; column: T; value: string; maxEdits?: number; substitutionsOnly?: boolean; wildcard?: string }

  | { type: 'inSet'; column: T; value: string[] }
  | { type: 'notInSet'; column: T; value: string[] }

  | { type: 'topN'; column: T; n: number }
  | { type: 'bottomN'; column: T; n: number }

  | { type: 'equal'; column: T; x: number }
  | { type: 'notEqual'; column: T; x: number }
  | { type: 'lessThan'; column: T; x: number }
  | { type: 'greaterThan'; column: T; x: number }
  | { type: 'lessThanOrEqual'; column: T; x: number }
  | { type: 'greaterThanOrEqual'; column: T; x: number }

  | { type: 'equalToColumn'; column: T; rhs: T }
  | { type: 'lessThanColumn'; column: T; rhs: T; minDiff?: number }
  | { type: 'greaterThanColumn'; column: T; rhs: T; minDiff?: number }
  | { type: 'lessThanColumnOrEqual'; column: T; rhs: T; minDiff?: number }
  | { type: 'greaterThanColumnOrEqual'; column: T; rhs: T; minDiff?: number };

export type FilterSpec<Leaf extends FilterSpecLeaf<unknown> = FilterSpecLeaf<SUniversalPColumnId>, Common = {}> =
  FilterSpecNode<Leaf, Common>;

export type FilterSpecType = Exclude<FilterSpec, { type: undefined }>['type'];

export type FilterSpecOfType<T extends FilterSpecType> = Extract<FilterSpec, { type: T }>;
