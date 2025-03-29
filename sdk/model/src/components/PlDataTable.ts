import type {
  AxisSpec,
  JoinEntry,
  PColumn,
  PColumnIdAndSpec,
  PColumnSpec,
  PColumnValues,
  PObjectId,
  PTableHandle,
  PTableRecordFilter,
  PTableSorting,
} from '@milaboratories/pl-model-common';
import {
  getAxisId,
  isPColumn,
  matchAxisId,
} from '@milaboratories/pl-model-common';
import type { RenderCtx } from '../render';
import { TreeNodeAccessor } from '../render';

/** Data table state */
export type PlDataTableGridState = {
  // TODO request stable key from the driver
  /**
   * Hash of the specs for now, but in the future it will be a stable id of the source
   */
  sourceId?: string;
  /** Includes column ordering */
  columnOrder?: {
    /** All colIds in order */
    orderedColIds: string[];
  };
  /** Includes current sort columns and direction */
  sort?: {
    /** Sorted columns and directions in order */
    sortModel: {
      /** Column Id to apply the sort to. */
      colId: string;
      /** Sort direction */
      sort: 'asc' | 'desc';
    }[];
  };
  /** Includes column visibility */
  columnVisibility?: {
    /** All colIds which were hidden */
    hiddenColIds: string[];
  };
  /** current sheet selections */
  sheets?: Record<string, string | number>;
};

/** TODO: refactor to use sheets in the grid state */
export type PlDataTableGridStateWithoutSheets = Omit<PlDataTableGridState, 'sheets'>;

export type PlDataTableSheet = {
  /** spec of the axis to use */
  axis: AxisSpec;
  /** options to show in the filter tan */
  options: {
    /** value of the option (should be one of the values in the axis or column) */
    value: string | number;
    /** corresponding label */
    label: string;
  }[];
  /** default (selected) value */
  defaultValue?: string | number;
};

/**
 * Params used to get p-table handle from the driver
 */
export type PTableParams = {
  /** For sourceType: 'pframe' the join is original one, enriched with label columns */
  join?: JoinEntry<PColumnIdAndSpec>;
  sorting?: PTableSorting[];
  filters?: PTableRecordFilter[];
};

/**
 * PlDataTable persisted state
 */
export type PlDataTableState = {
  // internal ag-grid state
  gridState: PlDataTableGridState;
  // mapping of gridState onto the p-table data structures
  pTableParams?: PTableParams;
};

/** PlTableFilters filter entry */
export type PlTableFilterIsNotNA = {
  /** Predicate type */
  type: 'isNotNA';
};

/** PlTableFilters filter entry */
export type PlTableFilterIsNA = {
  /** Predicate type */
  type: 'isNA';
};

/** PlTableFilters filter entries applicable to both string and number values */
export type PlTableFilterCommon = PlTableFilterIsNotNA | PlTableFilterIsNA;

/** PlTableFilters numeric filter entry */
export type PlTableFilterNumberEquals = {
  /** Predicate type */
  type: 'number_equals';
  /** Referense value */
  reference: number;
};

/** PlTableFilters numeric filter entry */
export type PlTableFilterNumberNotEquals = {
  /** Predicate type */
  type: 'number_notEquals';
  /** Referense value */
  reference: number;
};

/** PlTableFilters numeric filter entry */
export type PlTableFilterNumberGreaterThan = {
  /** Predicate type */
  type: 'number_greaterThan';
  /** Referense value */
  reference: number;
};

/** PlTableFilters numeric filter entry */
export type PlTableFilterNumberGreaterThanOrEqualTo = {
  /** Predicate type */
  type: 'number_greaterThanOrEqualTo';
  /** Referense value */
  reference: number;
};

/** PlTableFilters numeric filter entry */
export type PlTableFilterNumberLessThan = {
  /** Predicate type */
  type: 'number_lessThan';
  /** Referense value */
  reference: number;
};

/** PlTableFilters numeric filter entry */
export type PlTableFilterNumberLessThanOrEqualTo = {
  /** Predicate type */
  type: 'number_lessThanOrEqualTo';
  /** Referense value */
  reference: number;
};

/** PlTableFilters numeric filter entry */
export type PlTableFilterNumberBetween = {
  /** Predicate type */
  type: 'number_between';
  /** Referense value for the lower bound */
  lowerBound: number;
  /** Defines whether values equal to lower bound reference value should be matched */
  includeLowerBound: boolean;
  /** Referense value for the upper bound */
  upperBound: number;
  /** Defines whether values equal to upper bound reference value should be matched */
  includeUpperBound: boolean;
};

/** All PlTableFilters numeric filter entries */
export type PlTableFilterNumber =
  | PlTableFilterCommon
  | PlTableFilterNumberEquals
  | PlTableFilterNumberNotEquals
  | PlTableFilterNumberGreaterThan
  | PlTableFilterNumberGreaterThanOrEqualTo
  | PlTableFilterNumberLessThan
  | PlTableFilterNumberLessThanOrEqualTo
  | PlTableFilterNumberBetween;
/** All types of PlTableFilters numeric filter entries */
export type PlTableFilterNumberType = PlTableFilterNumber['type'];

/** PlTableFilters string filter entry */
export type PlTableFilterStringEquals = {
  /** Predicate type */
  type: 'string_equals';
  /** Referense value */
  reference: string;
};

/** PlTableFilters string filter entry */
export type PlTableFilterStringNotEquals = {
  /** Predicate type */
  type: 'string_notEquals';
  /** Referense value */
  reference: string;
};

/** PlTableFilters string filter entry */
export type PlTableFilterStringContains = {
  /** Predicate type */
  type: 'string_contains';
  /** Referense value */
  reference: string;
};

/** PlTableFilters string filter entry */
export type PlTableFilterStringDoesNotContain = {
  /** Predicate type */
  type: 'string_doesNotContain';
  /** Referense value */
  reference: string;
};

/** PlTableFilters string filter entry */
export type PlTableFilterStringMatches = {
  /** Predicate type */
  type: 'string_matches';
  /** Referense value */
  reference: string;
};

/** PlTableFilters string filter entry */
export type PlTableFilterStringDoesNotMatch = {
  /** Predicate type */
  type: 'string_doesNotMatch';
  /** Referense value */
  reference: string;
};

/** PlTableFilters string filter entry */
export type PlTableFilterStringContainsFuzzyMatch = {
  /** Predicate type */
  type: 'string_containsFuzzyMatch';
  /** Referense value */
  reference: string;
  /**
   * Maximum acceptable edit distance between reference value and matched substring
   * @see https://en.wikipedia.org/wiki/Edit_distance
   */
  maxEdits: number;
  /**
   * When {@link substitutionsOnly} is set to false
   * Levenshtein distance is used as edit distance (substitutions and indels)
   * @see https://en.wikipedia.org/wiki/Levenshtein_distance
   * When {@link substitutionsOnly} is set to true
   * Hamming distance is used as edit distance (substitutions only)
   * @see https://en.wikipedia.org/wiki/Hamming_distance
   */
  substitutionsOnly: boolean;
  /**
   * Single character in {@link reference} that will labelColumn any
   * single character in searched text.
   */
  wildcard?: string;
};

/** All PlTableFilters string filter entries */
export type PlTableFilterString =
  | PlTableFilterCommon
  | PlTableFilterStringEquals
  | PlTableFilterStringNotEquals
  | PlTableFilterStringContains
  | PlTableFilterStringDoesNotContain
  | PlTableFilterStringMatches
  | PlTableFilterStringDoesNotMatch
  | PlTableFilterStringContainsFuzzyMatch;
/** All types of PlTableFilters string filter entries */
export type PlTableFilterStringType = PlTableFilterString['type'];

/** All PlTableFilters filter entries */
export type PlTableFilter = PlTableFilterNumber | PlTableFilterString;
/** All types of PlTableFilters filter entries */
export type PlTableFilterType = PlTableFilter['type'];

/** Internal grid column identifier */
export type PlTableFilterColumnId = string;

/** PlTableFiltersState entry */
export type PlTableFiltersStateEntry = {
  /** Column identifier */
  columnId: PlTableFilterColumnId;
  /** Active filter */
  filter: PlTableFilter;
  /** Flag to temporarily disable filter */
  disabled: boolean;
};

/** PlTableFiltersModel state */
export type PlTableFiltersState = PlTableFiltersStateEntry[];

/** PlTableFilters model */
export type PlTableFiltersModel = {
  /** Internal PlTableFilters component state, do not change! */
  state?: PlTableFiltersState;
  /** Resulting filters which should be used in Join */
  filters?: PTableRecordFilter[];
};

export type CreatePlDataTableOps = {
  /** Table filters, should contain */
  filters?: PTableRecordFilter[];

  /**
   * Selects columns for which will be inner-joined to the table.
   *
   * Default behaviour: all columns are considered to be core
   */
  coreColumnPredicate?: (spec: PColumnSpec) => boolean;

  /**
   * Determines how core columns should be joined together:
   *   inner - so user will only see records present in all core columns
   *   full - so user will only see records present in any of the core columns
   *
   * All non-core columns will be left joined to the table produced by the core
   * columns, in other words records form the pool of non-core columns will only
   * make their way into the final table if core table contins corresponding key.
   *
   * Default: 'full'
   */
  coreJoinType?: 'inner' | 'full';
};

/**
 * Create p-table handle given ui table state
 *
 * @param ctx context
 * @param columns column list
 * @param tableState table ui state
 * @returns
 */
export function createPlDataTable<A, U>(
  ctx: RenderCtx<A, U>,
  columns: PColumn<TreeNodeAccessor | PColumnValues>[],
  tableState: PlDataTableState | undefined
): PTableHandle | undefined;
export function createPlDataTable<A, U>(
  ctx: RenderCtx<A, U>,
  columns: PColumn<TreeNodeAccessor | PColumnValues>[],
  tableState: PlDataTableState | undefined,
  ops: CreatePlDataTableOps
): PTableHandle | undefined;
/** @deprecated use method with extended ops as the last argument */
export function createPlDataTable<A, U>(
  ctx: RenderCtx<A, U>,
  columns: PColumn<TreeNodeAccessor | PColumnValues>[],
  tableState: PlDataTableState | undefined,
  filters: PTableRecordFilter[]
): PTableHandle | undefined;
export function createPlDataTable<A, U>(
  ctx: RenderCtx<A, U>,
  columns: PColumn<TreeNodeAccessor | PColumnValues>[],
  tableState: PlDataTableState | undefined,
  ops?: PTableRecordFilter[] | CreatePlDataTableOps,
): PTableHandle | undefined {
  // ops migration for backward compatibility with previous deprecated API
  if (Array.isArray(ops)) {
    ops = { filters: ops };
  }

  const allLabelCols = ctx.resultPool
    .getData()
    .entries.map((d) => d.obj)
    .filter(isPColumn)
    .filter((p) => p.spec.name === 'pl7.app/label' && p.spec.axesSpec.length === 1);

  const colId = (id: PObjectId, domain?: Record<string, string>) => {
    let wid = id.toString();
    if (domain) {
      for (const k in domain) {
        wid += k;
        wid += domain[k];
      }
    }
    return wid;
  };

  const labelColumns = new Map<string, PColumn<TreeNodeAccessor>>();

  for (const col of columns) {
    for (const axis of col.spec.axesSpec) {
      const axisId = getAxisId(axis);
      for (const labelColumn of allLabelCols) {
        const labelAxis = labelColumn.spec.axesSpec[0];
        const labelAxisId = getAxisId(labelColumn.spec.axesSpec[0]);
        if (matchAxisId(axisId, labelAxisId)) {
          const dataDomainLen = Object.keys(axisId.domain ?? {}).length;
          const labelDomainLen = Object.keys(labelAxisId.domain ?? {}).length;
          if (dataDomainLen > labelDomainLen) {
            const id = colId(labelColumn.id, axisId.domain);

            labelColumns.set(id, {
              id: id as PObjectId,
              spec: {
                ...labelColumn.spec,
                axesSpec: [{ ...axisId, annotations: labelAxis.annotations }],
              },
              data: labelColumn.data,
            });
          } else {
            labelColumns.set(colId(labelColumn.id), labelColumn);
          }
        }
      }
    }
  }

  // if at least one column is not yet ready, we can't show the table
  if (
    [...columns, ...labelColumns.values()].some(
      (a) => a.data instanceof TreeNodeAccessor && !a.data.getIsReadyOrError(),
    )
  )
    return undefined;

  let coreColumns = columns;
  const secondaryColumns: typeof columns = [];

  if (ops?.coreColumnPredicate) {
    coreColumns = [];
    for (const c of columns)
      if (ops.coreColumnPredicate(c.spec)) coreColumns.push(c);
      else secondaryColumns.push(c);
  }

  secondaryColumns.push(...labelColumns.values());

  return ctx.createPTable({
    src: {
      type: 'outer',
      primary: {
        type: ops?.coreJoinType ?? 'full',
        entries: coreColumns.map((c) => ({ type: 'column', column: c })),
      },
      secondary: secondaryColumns.map((c) => ({ type: 'column', column: c })),
    },
    filters: [...(ops?.filters ?? []), ...(tableState?.pTableParams?.filters ?? [])],
    sorting: tableState?.pTableParams?.sorting ?? [],
  });
}

/** Create sheet entries for PlDataTable */
export function createPlDataTableSheet<A, U>(
  ctx: RenderCtx<A, U>,
  axis: AxisSpec,
  values: (string | number)[],
): PlDataTableSheet {
  const labels = ctx.findLabels(axis);
  return {
    axis,
    options: values.map((v) => ({
      value: v,
      label: labels?.[v] ?? v.toString(),
    })),
    defaultValue: values[0],
  };
}
