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

export type FilterSpecLeaf =
  | { type: undefined }
  | { type: 'isNA'; column: SUniversalPColumnId }
  | { type: 'isNotNA'; column: SUniversalPColumnId }

  | { type: 'patternEquals'; column: SUniversalPColumnId; value: string }
  | { type: 'patternNotEquals'; column: SUniversalPColumnId; value: string }
  | { type: 'patternContainSubsequence'; column: SUniversalPColumnId; value: string }
  | { type: 'patternNotContainSubsequence'; column: SUniversalPColumnId; value: string }

  | { type: 'topN'; column: SUniversalPColumnId; n: number }
  | { type: 'bottomN'; column: SUniversalPColumnId; n: number }

  | { type: 'equal'; column: SUniversalPColumnId; x: number }
  | { type: 'lessThan'; column: SUniversalPColumnId; x: number }
  | { type: 'greaterThan'; column: SUniversalPColumnId; x: number }
  | { type: 'lessThanOrEqual'; column: SUniversalPColumnId; x: number }
  | { type: 'greaterThanOrEqual'; column: SUniversalPColumnId; x: number }

  | { type: 'equalToColumn'; column: SUniversalPColumnId; rhs: SUniversalPColumnId }
  | { type: 'lessThanColumn'; column: SUniversalPColumnId; rhs: SUniversalPColumnId; minDiff?: number }
  | { type: 'greaterThanColumn'; column: SUniversalPColumnId; rhs: SUniversalPColumnId; minDiff?: number }
  | { type: 'lessThanColumnOrEqual'; column: SUniversalPColumnId; rhs: SUniversalPColumnId; minDiff?: number }
  | { type: 'greaterThanColumnOrEqual'; column: SUniversalPColumnId; rhs: SUniversalPColumnId; minDiff?: number };

export type FilterSpec<Leaf extends FilterSpecLeaf = FilterSpecLeaf, Common = {}> =
  FilterSpecNode<Leaf, Common>;

export type FilterSpecType = Exclude<FilterSpec, { type: undefined }>['type'];

export type FilterSpecOfType<T extends FilterSpecType> = Extract<FilterSpec, { type: T }>;
