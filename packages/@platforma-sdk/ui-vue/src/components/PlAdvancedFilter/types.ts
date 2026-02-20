import type {
  AxisId,
  AxisSpec,
  CanonicalizedJson,
  FilterSpec,
  FilterSpecLeaf,
  PColumnSpec,
  SUniversalPColumnId,
} from "@platforma-sdk/model";
import type { SUPPORTED_FILTER_TYPES } from "./constants";

export type Operand = "or" | "and";

export type PlAdvancedFilterColumnId = SUniversalPColumnId | CanonicalizedJson<AxisId>;

export type RequiredMeta = { id: number; isExpanded?: boolean };

export type FilterLeafContent = Extract<
  FilterSpecLeaf<PlAdvancedFilterColumnId>,
  { type: SupportedFilterTypes }
>;
export type CommonFilter<Meta extends RequiredMeta = RequiredMeta> = FilterSpec<
  FilterLeafContent,
  Meta
>;
export type FilterLeaf<Meta extends RequiredMeta = RequiredMeta> = Exclude<
  CommonFilter<Meta>,
  { type: Operand | "not" }
>;
export type NodeFilter<Meta extends RequiredMeta = RequiredMeta> = Extract<
  CommonFilter<Meta>,
  { type: Operand | "not" }
>;
export type RootFilter<Meta extends RequiredMeta = RequiredMeta> = Omit<
  Extract<NodeFilter<Meta>, { type: Operand }>,
  "filters"
> & {
  filters: NodeFilter<Meta>[];
};

// Not supported: less(/greater)ThanColumn, less(/greater)ThanColumnOrEqual
// or, and, not - in groups
export type SupportedFilterTypes = (typeof SUPPORTED_FILTER_TYPES)[number];

type RequireFields<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;
type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

type NumericalWithOptionalN = "topN" | "bottomN";
type NumericalWithOptionalX =
  | "lessThan"
  | "lessThanOrEqual"
  | "greaterThan"
  | "greaterThanOrEqual"
  | "equal"
  | "notEqual";
type StringWithOptionalValue = "patternEquals" | "patternNotEquals";
// types from ui with some changed by optionality fields
type EditedTypes =
  | "patternFuzzyContainSubsequence"
  | NumericalWithOptionalX
  | StringWithOptionalValue
  | NumericalWithOptionalN;
export type EditableFilter =
  | Exclude<FilterLeafContent, { type: EditedTypes }>
  | RequireFields<
      Extract<FilterLeafContent, { type: "patternFuzzyContainSubsequence" }>,
      "maxEdits" | "substitutionsOnly"
    >
  | OptionalFields<Extract<FilterLeafContent, { type: NumericalWithOptionalN }>, "n">
  | OptionalFields<Extract<FilterLeafContent, { type: NumericalWithOptionalX }>, "x">
  | OptionalFields<Extract<FilterLeafContent, { type: StringWithOptionalValue }>, "value">;

export type FixedAxisInfo = {
  idx: number;
  label: string;
};

export type SourceOptionInfo = {
  id: PlAdvancedFilterColumnId;
  label: string;
  spec: PColumnSpec | AxisSpec;
  error?: boolean;
  alphabet?: "nucleotide" | "aminoacid" | string;
  axesToBeFixed?: FixedAxisInfo[];
};
