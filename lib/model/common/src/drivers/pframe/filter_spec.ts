import type { SUniversalPColumnId } from "./spec/ids";

export type FilterSpecNode<Leaf, CommonNode = {}, CommonLeaf = {}> =
  | (CommonLeaf & Leaf)
  | (CommonNode & { type: "not"; filter: FilterSpecNode<Leaf, CommonNode, CommonLeaf> })
  | (CommonNode & { type: "or"; filters: FilterSpecNode<Leaf, CommonNode, CommonLeaf>[] })
  | (CommonNode & { type: "and"; filters: FilterSpecNode<Leaf, CommonNode, CommonLeaf>[] });

export type FilterSpecLeaf<T = SUniversalPColumnId> =
  | { type: undefined }
  | { type: "isNA"; column: T }
  | { type: "isNotNA"; column: T }
  | { type: "ifNa"; column: T; replacement: string }
  | { type: "patternEquals"; column: T; value: string }
  | { type: "patternNotEquals"; column: T; value: string }
  | { type: "patternContainSubsequence"; column: T; value: string }
  | { type: "patternNotContainSubsequence"; column: T; value: string }
  | { type: "patternMatchesRegularExpression"; column: T; value: string }
  | {
      type: "patternFuzzyContainSubsequence";
      column: T;
      value: string;
      maxEdits?: number;
      substitutionsOnly?: boolean;
      wildcard?: string;
    }
  | { type: "inSet"; column: T; value: string[] }
  | { type: "notInSet"; column: T; value: string[] }
  | { type: "topN"; column: T; n: number }
  | { type: "bottomN"; column: T; n: number }
  | { type: "equal"; column: T; x: number }
  | { type: "notEqual"; column: T; x: number }
  | { type: "lessThan"; column: T; x: number }
  | { type: "greaterThan"; column: T; x: number }
  | { type: "lessThanOrEqual"; column: T; x: number }
  | { type: "greaterThanOrEqual"; column: T; x: number }
  | { type: "equalToColumn"; column: T; rhs: T }
  | { type: "lessThanColumn"; column: T; rhs: T; minDiff?: number }
  | { type: "greaterThanColumn"; column: T; rhs: T; minDiff?: number }
  | { type: "lessThanColumnOrEqual"; column: T; rhs: T; minDiff?: number }
  | { type: "greaterThanColumnOrEqual"; column: T; rhs: T; minDiff?: number };

export type FilterSpec<
  Leaf extends FilterSpecLeaf<unknown> = FilterSpecLeaf<SUniversalPColumnId>,
  CommonNode = {},
  CommonLeaf = CommonNode,
> = FilterSpecNode<Leaf, CommonNode, CommonLeaf>;

export type FilterSpecType = Exclude<FilterSpec, { type: undefined }>["type"];

export type FilterSpecOfType<T extends FilterSpecType> = Extract<FilterSpec, { type: T }>;

/** Tree-based record filters for PTable V2. */
export type PTableFilters = FilterSpec<FilterSpecLeaf<string>> | null;
