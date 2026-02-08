import type {
  FilterSpec as _FilterSpec,
  AnnotationSpecUi,
  FilterSpecLeaf,
  FilterSpecUi,
} from "@platforma-sdk/model";
export type { FilterSpecType } from "@platforma-sdk/model";

export type FilterSpec = _FilterSpec<
  FilterSpecLeaf,
  { id: number; name?: string; isExpanded?: boolean }
>;

export type Filter = FilterSpecUi<Extract<FilterSpec, { type: "and" | "or" }>> & { id: number };

export type Annotation = AnnotationSpecUi<Filter> & { defaultValue?: string };
