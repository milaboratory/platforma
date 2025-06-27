import type {
  PlTableFilter,
  PlTableFilterType,
  PTableColumnSpec,
} from '@platforma-sdk/model';

/** PlTableFilters settings */
export type PlTableFiltersSettingsV2 =
  | { sourceId: null }
  | {
    sourceId: string;
    columns: {
      /** Specs where axes are already replaced with label columns whenever possible */
      spec: PTableColumnSpec;
      options?: PlTableFilterType[];
      default?: PlTableFilter;
    }[];
  };
