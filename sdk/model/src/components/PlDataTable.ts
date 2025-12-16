import type {
  AxisId,
  AxisSpec,
  CanonicalizedJson,
  DataInfo,
  ListOptionBase,
  PColumn,
  PColumnIdAndSpec,
  PColumnValues,
  PObjectId,
  PTableColumnId,
  PTableColumnIdAxis,
  PTableColumnIdColumn,
  PTableColumnSpec,
  PTableDef,
  PTableHandle,
  PTableRecordFilter,
  PTableRecordSingleValueFilterV2,
  PTableSorting,
} from '@milaboratories/pl-model-common';
import {
  Annotation,
  canonicalizeJson,
  getAxisId,
  getColumnIdAndSpec,
  isLabelColumn,
  isLinkerColumn,
  matchAxisId,
  PColumnName,
  readAnnotation,
  uniqueBy,
} from '@milaboratories/pl-model-common';
import type {
  AxisLabelProvider,
  ColumnProvider,
  PColumnDataUniversal,
  RenderCtx,
  TreeNodeAccessor,
} from '../render';
import {
  allPColumnsReady,
  PColumnCollection,
} from '../render';

export type PlTableColumnId = {
  /** Original column spec */
  source: PTableColumnSpec;
  /** Column spec with labeled axes replaced by label columns */
  labeled: PTableColumnSpec;
};

export type PlTableColumnIdJson = CanonicalizedJson<PlTableColumnId>;

export type PlDataTableGridStateCore = {
  /** Includes column ordering */
  columnOrder?: {
    /** All colIds in order */
    orderedColIds: PlTableColumnIdJson[];
  };
  /** Includes current sort columns and direction */
  sort?: {
    /** Sorted columns and directions in order */
    sortModel: {
      /** Column Id to apply the sort to. */
      colId: PlTableColumnIdJson;
      /** Sort direction */
      sort: 'asc' | 'desc';
    }[];
  };
  /** Includes column visibility */
  columnVisibility?: {
    /** All colIds which were hidden */
    hiddenColIds: PlTableColumnIdJson[];
  };
};

export type PlDataTableSheet = {
  /** spec of the axis to use */
  axis: AxisSpec;
  /** options to show in the filter dropdown */
  options: ListOptionBase<string | number>[];
  /** default (selected) value */
  defaultValue?: string | number;
};

export type PlDataTableSheetState = {
  /** id of the axis */
  axisId: AxisId;
  /** selected value */
  value: string | number;
};

/**
 * PlDataTableV2 persisted state
 */
export type PlDataTableStateV2 =
  // Old versions of the state
  | {
    // no version
    gridState: {
      columnOrder?: {
        orderedColIds: CanonicalizedJson<PTableColumnSpec>[];
      };
      sort?: {
        sortModel: {
          colId: CanonicalizedJson<PTableColumnSpec>;
          sort: 'asc' | 'desc';
        }[];
      };
      columnVisibility?: {
        hiddenColIds: CanonicalizedJson<PTableColumnSpec>[];
      };
      sourceId?: string;
      sheets?: Record<CanonicalizedJson<AxisId>, string | number>;
    };
    pTableParams?: {
      sorting?: PTableSorting[];
      filters?: PTableRecordFilter[];
    };
  }
  | {
    version: 2;
    stateCache: {
      sourceId: string;
      gridState: {
        columnOrder?: {
          orderedColIds: CanonicalizedJson<PTableColumnSpec>[];
        };
        sort?: {
          sortModel: {
            colId: CanonicalizedJson<PTableColumnSpec>;
            sort: 'asc' | 'desc';
          }[];
        };
        columnVisibility?: {
          hiddenColIds: CanonicalizedJson<PTableColumnSpec>[];
        };
      };
      sheetsState: PlDataTableSheetState[];
    }[];
    pTableParams: {
      hiddenColIds: PObjectId[] | null;
      filters: PTableRecordFilter[];
      sorting: PTableSorting[];
    };
  }
  | {
    version: 3;
    stateCache: {
      sourceId: string;
      gridState: {
        columnOrder?: {
          orderedColIds: CanonicalizedJson<PTableColumnSpec>[];
        };
        sort?: {
          sortModel: {
            colId: CanonicalizedJson<PTableColumnSpec>;
            sort: 'asc' | 'desc';
          }[];
        };
        columnVisibility?: {
          hiddenColIds: CanonicalizedJson<PTableColumnSpec>[];
        };
      };
      sheetsState: PlDataTableSheetState[];
      filtersState: PlDataTableFilterState[];
    }[];
    pTableParams: PTableParamsV2;
  }
  // Normalized state
  | PlDataTableStateV2Normalized;

export type PlDataTableStateV2CacheEntry = {
  /** DataSource identifier for state management */
  sourceId: string;
  /** Internal ag-grid state */
  gridState: PlDataTableGridStateCore;
  /** Sheets state */
  sheetsState: PlDataTableSheetState[];
  /** Filters state */
  filtersState: PlDataTableFilterState[];
};

export type PTableParamsV2 =
  | {
    sourceId: null;
    hiddenColIds: null;
    partitionFilters: [];
    filters: [];
    sorting: [];
  }
  | {
    sourceId: string;
    hiddenColIds: PObjectId[] | null;
    partitionFilters: PTableRecordFilter[];
    filters: PTableRecordFilter[];
    sorting: PTableSorting[];
  };

export type PlDataTableStateV2Normalized = {
  /** Version for upgrades */
  version: 4;
  /** Internal states, LRU cache for 5 sourceId-s */
  stateCache: PlDataTableStateV2CacheEntry[];
  /** PTable params derived from the cache state for the current sourceId */
  pTableParams: PTableParamsV2;
};

export function makeDefaultPTableParams(): PTableParamsV2 {
  return {
    sourceId: null,
    hiddenColIds: null,
    partitionFilters: [],
    filters: [],
    sorting: [],
  };
}

/** Create default PlDataTableStateV2 */
export function createPlDataTableStateV2(): PlDataTableStateV2Normalized {
  return {
    version: 4,
    stateCache: [],
    pTableParams: makeDefaultPTableParams(),
  };
}

/** Upgrade PlDataTableStateV2 to the latest version */
export function upgradePlDataTableStateV2(state: PlDataTableStateV2 | undefined): PlDataTableStateV2Normalized {
  // Block just added, had no state, model started earlier than the UI
  if (!state) {
    return createPlDataTableStateV2();
  }
  // v1 -> v2
  if (!('version' in state)) {
    // Non upgradeable as sourceId calculation algorithm has changed, resetting state to default
    state = createPlDataTableStateV2();
  }
  // v2 -> v3
  if (state.version === 2) {
    state = {
      version: 3,
      stateCache: state.stateCache.map((entry) => ({
        ...entry,
        filtersState: [],
      })),
      pTableParams: makeDefaultPTableParams(),
    };
  }
  // v3 -> v4
  if (state.version === 3) {
    // Non upgradeable as column ids calculation algorithm has changed, resetting state to default
    state = createPlDataTableStateV2();
  }
  return state;
}

export type PlDataTableFilterState = {
  id: PTableColumnId;
  alphabetic: boolean;
  filter: null | {
    value: PlTableFilter;
    disabled: boolean;
  };
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
  /** Reference value */
  reference: number;
};

/** PlTableFilters numeric filter entry */
export type PlTableFilterNumberNotEquals = {
  /** Predicate type */
  type: 'number_notEquals';
  /** Reference value */
  reference: number;
};

/** PlTableFilters numeric filter entry */
export type PlTableFilterNumberGreaterThan = {
  /** Predicate type */
  type: 'number_greaterThan';
  /** Reference value */
  reference: number;
};

/** PlTableFilters numeric filter entry */
export type PlTableFilterNumberGreaterThanOrEqualTo = {
  /** Predicate type */
  type: 'number_greaterThanOrEqualTo';
  /** Reference value */
  reference: number;
};

/** PlTableFilters numeric filter entry */
export type PlTableFilterNumberLessThan = {
  /** Predicate type */
  type: 'number_lessThan';
  /** Reference value */
  reference: number;
};

/** PlTableFilters numeric filter entry */
export type PlTableFilterNumberLessThanOrEqualTo = {
  /** Predicate type */
  type: 'number_lessThanOrEqualTo';
  /** Reference value */
  reference: number;
};

/** PlTableFilters numeric filter entry */
export type PlTableFilterNumberBetween = {
  /** Predicate type */
  type: 'number_between';
  /** Reference value for the lower bound */
  lowerBound: number;
  /** Defines whether values equal to lower bound reference value should be matched */
  includeLowerBound: boolean;
  /** Reference value for the upper bound */
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
  /** Reference value */
  reference: string;
};

/** PlTableFilters string filter entry */
export type PlTableFilterStringNotEquals = {
  /** Predicate type */
  type: 'string_notEquals';
  /** Reference value */
  reference: string;
};

/** PlTableFilters string filter entry */
export type PlTableFilterStringContains = {
  /** Predicate type */
  type: 'string_contains';
  /** Reference value */
  reference: string;
};

/** PlTableFilters string filter entry */
export type PlTableFilterStringDoesNotContain = {
  /** Predicate type */
  type: 'string_doesNotContain';
  /** Reference value */
  reference: string;
};

/** PlTableFilters string filter entry */
export type PlTableFilterStringMatches = {
  /** Predicate type */
  type: 'string_matches';
  /** Reference value */
  reference: string;
};

/** PlTableFilters string filter entry */
export type PlTableFilterStringDoesNotMatch = {
  /** Predicate type */
  type: 'string_doesNotMatch';
  /** Reference value */
  reference: string;
};

/** PlTableFilters string filter entry */
export type PlTableFilterStringContainsFuzzyMatch = {
  /** Predicate type */
  type: 'string_containsFuzzyMatch';
  /** Reference value */
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

export type CreatePlDataTableOps = {
  /** Filters for columns and non-partitioned axes */
  filters?: PTableRecordFilter[];

  /** Sorting to columns hidden from user */
  sorting?: PTableSorting[];

  /**
   * Selects columns for which will be inner-joined to the table.
   *
   * Default behaviour: all columns are considered to be core
   */
  coreColumnPredicate?: (spec: PColumnIdAndSpec) => boolean;

  /**
   * Determines how core columns should be joined together:
   *   inner - so user will only see records present in all core columns
   *   full - so user will only see records present in any of the core columns
   *
   * All non-core columns will be left joined to the table produced by the core
   * columns, in other words records form the pool of non-core columns will only
   * make their way into the final table if core table contains corresponding key.
   *
   * Default: 'full'
   */
  coreJoinType?: 'inner' | 'full';
};

/** Get all label columns from the result pool */
export function getAllLabelColumns(
  resultPool: AxisLabelProvider & ColumnProvider,
): PColumn<PColumnDataUniversal>[] | undefined {
  return new PColumnCollection()
    .addAxisLabelProvider(resultPool)
    .addColumnProvider(resultPool)
    .getColumns({
      name: PColumnName.Label,
      axes: [{}], // exactly one axis
    }, { dontWaitAllData: true });
}

/** Get label columns matching the provided columns from the result pool */
export function getMatchingLabelColumns(
  columns: PColumnIdAndSpec[],
  allLabelColumns: PColumn<PColumnDataUniversal>[],
): PColumn<PColumnDataUniversal>[] {
  // split input columns into label and value columns
  const inputLabelColumns: typeof columns = [];
  const inputValueColumns: typeof columns = [];
  for (const column of columns) {
    if (isLabelColumn(column.spec)) {
      inputLabelColumns.push(column);
    } else {
      inputValueColumns.push(column);
    }
  }

  // collect distinct axes of value columns
  const unlabeledAxes: AxisId[] = [];
  for (const column of inputValueColumns) {
    for (const axis of column.spec.axesSpec) {
      const axisId = getAxisId(axis);
      if (!unlabeledAxes.some((id) => matchAxisId(id, axisId))) {
        unlabeledAxes.push(axisId);
      }
    }
  }

  // remove axes matched by input label columns
  for (const labelColumn of inputLabelColumns) {
    const labelAxisId = getAxisId(labelColumn.spec.axesSpec[0]);
    const labelMatch = unlabeledAxes.findIndex((axisId) => matchAxisId(axisId, labelAxisId));
    if (labelMatch !== -1) {
      unlabeledAxes.splice(labelMatch, 1);
    }
  }

  // warning: changing this id will break backward compatibility
  const colId = (id: PObjectId, domain?: Record<string, string>): PObjectId => {
    let wid = id.toString();
    if (domain) {
      for (const k in domain) {
        wid += k;
        wid += domain[k];
      }
    }
    return wid as PObjectId;
  };

  // search label columns for unmatched axes
  const labelColumns: typeof allLabelColumns = [];
  for (const labelColumn of allLabelColumns) {
    const labelAxis = labelColumn.spec.axesSpec[0];
    const labelAxisId = getAxisId(labelAxis);
    const labelMatch = unlabeledAxes.findIndex((axisId) => matchAxisId(axisId, labelAxisId));
    if (labelMatch !== -1) {
      const axisId = unlabeledAxes[labelMatch];
      const dataDomainLen = Object.keys(axisId.domain ?? {}).length;
      const labelDomainLen = Object.keys(labelAxis.domain ?? {}).length;
      if (dataDomainLen > labelDomainLen) {
        labelColumns.push({
          id: colId(labelColumn.id, axisId.domain),
          spec: {
            ...labelColumn.spec,
            axesSpec: [{ ...axisId, annotations: labelAxis.annotations }],
          },
          data: labelColumn.data,
        });
      } else {
        labelColumns.push(labelColumn);
      }
      unlabeledAxes.splice(labelMatch, 1);
    }
  }
  return labelColumns;
}

function createPTableDef(params: {
  columns: PColumn<PColumnDataUniversal>[];
  labelColumns: PColumn<PColumnDataUniversal>[];
  coreJoinType: 'inner' | 'full';
  partitionFilters: PTableRecordSingleValueFilterV2[];
  filters: PTableRecordSingleValueFilterV2[];
  sorting: PTableSorting[];
  coreColumnPredicate?: ((spec: PColumnIdAndSpec) => boolean);
}): PTableDef<PColumn<TreeNodeAccessor | PColumnValues | DataInfo<TreeNodeAccessor>>> {
  let coreColumns = params.columns;
  const secondaryColumns: typeof params.columns = [];

  if (params.coreColumnPredicate) {
    coreColumns = [];
    for (const c of params.columns)
      if (params.coreColumnPredicate(getColumnIdAndSpec(c))) coreColumns.push(c);
      else secondaryColumns.push(c);
  }

  secondaryColumns.push(...params.labelColumns);

  return {
    src: {
      type: 'outer',
      primary: {
        type: params.coreJoinType,
        entries: coreColumns.map((c) => ({ type: 'column', column: c })),
      },
      secondary: secondaryColumns.map((c) => ({ type: 'column', column: c })),
    },
    partitionFilters: params.partitionFilters,
    filters: params.filters,
    sorting: params.sorting,
  };
}

/** PlAgDataTable model */
export type PlDataTableModel = {
  /** DataSource identifier for state management */
  sourceId: string | null;
  /** p-table including all columns, used to show the full specification of the table */
  fullTableHandle: PTableHandle;
  /** p-table including only visible columns, used to get the data */
  visibleTableHandle: PTableHandle;
};

/** Check if column should be omitted from the table */
export function isColumnHidden(spec: { annotations?: Annotation }): boolean {
  return readAnnotation(spec, Annotation.Table.Visibility) === 'hidden';
}

/** Check if column is hidden by default */
export function isColumnOptional(spec: { annotations?: Annotation }): boolean {
  return readAnnotation(spec, Annotation.Table.Visibility) === 'optional';
}

/**
 * Create p-table spec and handle given ui table state
 *
 * @param ctx context
 * @param columns column list
 * @param tableState table ui state
 * @returns PlAgDataTableV2 table source
 */
export function createPlDataTableV2<A, U>(
  ctx: RenderCtx<A, U>,
  columns: PColumn<PColumnDataUniversal>[],
  tableState: PlDataTableStateV2 | undefined,
  ops?: CreatePlDataTableOps,
): PlDataTableModel | undefined {
  if (columns.length === 0) return undefined;

  const tableStateNormalized = upgradePlDataTableStateV2(tableState);

  const allLabelColumns = getAllLabelColumns(ctx.resultPool);
  if (!allLabelColumns) return undefined;

  const fullLabelColumns = getMatchingLabelColumns(columns.map(getColumnIdAndSpec), allLabelColumns);
  const fullColumns = [...columns, ...fullLabelColumns];

  const fullColumnsAxes = uniqueBy(
    fullColumns.flatMap((c) => c.spec.axesSpec.map((a) => getAxisId(a))),
    (a) => canonicalizeJson<AxisId>(a),
  );
  const fullColumnsIds: PTableColumnId[] = [
    ...fullColumnsAxes.map((a) => ({ type: 'axis', id: a } satisfies PTableColumnIdAxis)),
    ...fullColumns.map((c) => ({ type: 'column', id: c.id } satisfies PTableColumnIdColumn)),
  ];
  const fullColumnsIdsSet = new Set(fullColumnsIds.map((c) => canonicalizeJson<PTableColumnId>(c)));
  const isValidColumnId = (id: PTableColumnId): boolean => fullColumnsIdsSet.has(canonicalizeJson<PTableColumnId>(id));

  const coreJoinType = ops?.coreJoinType ?? 'full';
  const partitionFilters: PTableRecordSingleValueFilterV2[]
    = tableStateNormalized.pTableParams.partitionFilters
      .filter((f) => {
        const valid = isValidColumnId(f.column);
        if (!valid) ctx.logWarn(`Partition filter ${JSON.stringify(f)} does not match provided columns, skipping`);
        return valid;
      });
  const filters: PTableRecordSingleValueFilterV2[]
    = uniqueBy(
      [...(ops?.filters ?? []), ...tableStateNormalized.pTableParams.filters],
      (f) => canonicalizeJson<PTableColumnId>(f.column),
    ).filter((f) => {
      const valid = isValidColumnId(f.column);
      if (!valid) ctx.logWarn(`Filter ${JSON.stringify(f)} does not match provided columns, skipping`);
      return valid;
    });
  const sorting: PTableSorting[]
    = uniqueBy(
      [...(ops?.sorting ?? []), ...tableStateNormalized.pTableParams.sorting],
      (s) => canonicalizeJson<PTableColumnId>(s.column),
    ).filter((s) => {
      const valid = isValidColumnId(s.column);
      if (!valid) ctx.logWarn(`Sorting ${JSON.stringify(s)} does not match provided columns, skipping`);
      return valid;
    });

  const fullDef = createPTableDef({
    columns,
    labelColumns: fullLabelColumns,
    coreJoinType,
    partitionFilters,
    filters,
    sorting,
    coreColumnPredicate: ops?.coreColumnPredicate,
  });
  const fullHandle = ctx.createPTable(fullDef);
  if (!fullHandle) return undefined;

  const hiddenColumns = new Set<PObjectId>(((): PObjectId[] => {
    // Inner join works as a filter - all columns must be present
    if (coreJoinType === 'inner') return [];

    const hiddenColIds = tableStateNormalized.pTableParams.hiddenColIds;
    if (hiddenColIds) return hiddenColIds;

    return columns
      .filter((c) => isColumnOptional(c.spec))
      .map((c) => c.id);
  })());

  // Preserve linker columns
  columns
    .filter((c) => isLinkerColumn(c.spec))
    .forEach((c) => hiddenColumns.delete(c.id));

  // Preserve core columns as they change the shape of join.
  const coreColumnPredicate = ops?.coreColumnPredicate;
  if (coreColumnPredicate) {
    const coreColumns = columns.flatMap((c) => coreColumnPredicate(getColumnIdAndSpec(c)) ? [c.id] : []);
    coreColumns.forEach((c) => hiddenColumns.delete(c));
  }

  // Filters decrease the number of result rows, sorting changes the order of result rows
  [...partitionFilters.map((f) => f.column), ...filters.map((f) => f.column), ...sorting.map((s) => s.column)]
    .filter((c): c is PTableColumnIdColumn => c.type === 'column')
    .forEach((c) => hiddenColumns.delete(c.id));

  const visibleColumns = columns.filter((c) => !hiddenColumns.has(c.id));
  const visibleLabelColumns = getMatchingLabelColumns(visibleColumns.map(getColumnIdAndSpec), allLabelColumns);

  // if at least one column is not yet computed, we can't show the table
  if (!allPColumnsReady([...visibleColumns, ...visibleLabelColumns])) return undefined;

  const visibleDef = createPTableDef({
    columns: visibleColumns,
    labelColumns: visibleLabelColumns,
    coreJoinType,
    partitionFilters,
    filters,
    sorting,
    coreColumnPredicate,
  });
  const visibleHandle = ctx.createPTable(visibleDef);
  if (!visibleHandle) return undefined;

  return {
    sourceId: tableStateNormalized.pTableParams.sourceId,
    fullTableHandle: fullHandle,
    visibleTableHandle: visibleHandle,
  } satisfies PlDataTableModel;
}

/** Create sheet entries for PlDataTable */
export function createPlDataTableSheet<A, U>(
  ctx: RenderCtx<A, U>,
  axis: AxisSpec,
  values: (string | number)[],
): PlDataTableSheet {
  const labels = ctx.resultPool.findLabels(axis);
  return {
    axis,
    options: values.map((v) => ({
      value: v,
      label: labels?.[v] ?? v.toString(),
    })),
    defaultValue: values[0],
  };
}
