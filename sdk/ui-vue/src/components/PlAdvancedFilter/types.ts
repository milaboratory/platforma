import type {
  AxisId,
  AxisSpec,
  CanonicalizedJson,
  FilterSpec,
  FilterSpecLeaf,
  PColumnSpec,
  PTableColumnId,
  SUniversalPColumnId,
} from "@platforma-sdk/model";
import type { SUPPORTED_FILTER_TYPES } from "./constants";
import { PartialBy, RequiredBy } from "@milaboratories/helpers";

export type Operand = "or" | "and";

// Can be any of string type, but for better type safety we use union of specific types
export type PlAdvancedFilterColumnId =
  | SUniversalPColumnId
  | CanonicalizedJson<AxisId>
  | CanonicalizedJson<PTableColumnId>;

export type RequiredMeta = {
  id: number;
  isExpanded?: boolean;
  isSuppressed?: boolean;
  source?: string;
};

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

type NumericalWithOptionalN = "topN" | "bottomN";
type NumericalWithOptionalX =
  | "lessThan"
  | "lessThanOrEqual"
  | "greaterThan"
  | "greaterThanOrEqual"
  | "equal"
  | "notEqual";
type StringWithOptionalValue = "patternEquals" | "patternNotEquals";
type EditedTypes =
  | "patternFuzzyContainSubsequence"
  | NumericalWithOptionalX
  | StringWithOptionalValue
  | NumericalWithOptionalN;

export type EditableFilter =
  | Exclude<FilterLeafContent, { type: EditedTypes }>
  | RequiredBy<
      Extract<FilterLeafContent, { type: "patternFuzzyContainSubsequence" }>,
      "maxEdits" | "substitutionsOnly"
    >
  | PartialBy<Extract<FilterLeafContent, { type: NumericalWithOptionalN }>, "n">
  | PartialBy<Extract<FilterLeafContent, { type: NumericalWithOptionalX }>, "x">
  | PartialBy<Extract<FilterLeafContent, { type: StringWithOptionalValue }>, "value">;

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
