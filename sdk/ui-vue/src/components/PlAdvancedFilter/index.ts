import { SUPPORTED_FILTER_TYPES } from "./constants.ts";
import type {
  RootFilter,
  SourceOptionInfo,
  PlAdvancedFilterColumnId,
  RequiredMeta,
} from "./types.ts";

export { default as PlAdvancedFilter } from "./PlAdvancedFilter.vue";
export const PlAdvancedFilterSupportedFilters = SUPPORTED_FILTER_TYPES;
export type PlAdvancedFilterItem = SourceOptionInfo;
export type PlAdvancedFilter<Meta extends RequiredMeta = RequiredMeta> = RootFilter<Meta>;
export { PlAdvancedFilterColumnId };
