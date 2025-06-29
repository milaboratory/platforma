import type {
  ListOption,
} from '@milaboratories/uikit';
import type {
  PTableColumnSpec,
  PlTableFilter,
  PlDataTableFilterState,
  PlTableFilterType,
} from '@platforma-sdk/model';

export type PlDataTableFiltersSettings = {
  /** Table columns for the sourceId */
  columns: PTableColumnSpec[];
  /** Callback configuring filter options for the column */
  config: (column: PTableColumnSpec) => {
    options?: PlTableFilterType[];
    default?: PlTableFilter;
  };
  /** Persisted selection for the sourceId */
  cachedState: PlDataTableFilterState[];
};

export type PlDataTableFilterStateInternal = PlDataTableFilterState & {
  spec: PTableColumnSpec;
  filter: null | {
    value: PlTableFilter;
    disabled: boolean;
    open: boolean;
  };
  label: string;
  options: ListOption<PlTableFilterType>[];
  discreteOptions: ListOption<number | string>[];
  defaultFilter: PlTableFilter | null;
};
