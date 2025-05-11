import type {
  AxesSpec,
  AxisId,
  AxisSpec,
  CanonicalizedJson,
  DataInfo,
  JoinEntry,
  PColumn,
  PColumnIdAndSpec,
  PColumnSpec,
  PColumnValues,
  PObjectId,
  PTableColumnIdColumn,
  PTableColumnSpec,
  PTableDef,
  PTableHandle,
  PTableRecordFilter,
  PTableRecordSingleValueFilterV2,
  PTableSorting,
  PTableValue,
} from '@milaboratories/pl-model-common';
import {
  canonicalizeJson,
  getAxisId,
  getColumnIdAndSpec,
  matchAxisId,
} from '@milaboratories/pl-model-common';
import type {
  AxisLabelProvider,
  ColumnProvider,
  RenderCtx,
} from '../render';
import {
  PColumnCollection,
  TreeNodeAccessor,
} from '../render';

/** Canonicalized PTableColumnSpec JSON string */
export type PTableColumnSpecJson = CanonicalizedJson<PTableColumnSpec>;

/** Encode `PTableColumnId` as canonicalized JSON string */
export function stringifyPTableColumnId(spec: PTableColumnSpec): PTableColumnSpecJson {
  const type = spec.type;
  switch (type) {
    case 'axis':
      return canonicalizeJson(spec);
    case 'column':
      return canonicalizeJson(spec);
    default:
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw Error(`unsupported column type: ${type satisfies never}`);
  }
}

/** Parse `PTableColumnId` from JSON string */
export function parsePTableColumnId(str: PTableColumnSpecJson): PTableColumnSpec {
  return JSON.parse(str) as PTableColumnSpec;
}

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
    hiddenColIds: PTableColumnSpecJson[];
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

/** Check if column is a label column */
export function isLabelColumn(column: PColumnSpec) {
  return column.axesSpec.length === 1 && column.name === 'pl7.app/label';
}

/** Get all label columns from the result pool */
export function getAllLabelColumns(
  resultPool: AxisLabelProvider & ColumnProvider,
): PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor>>[] | undefined {
  return new PColumnCollection()
    .addAxisLabelProvider(resultPool)
    .addColumnProvider(resultPool)
    .getColumns({
      name: 'pl7.app/label',
      axes: [{}], // exactly one axis
    }, { dontWaitAllData: true });
}

/** Get label columns matching the provided columns from the result pool */
export function getMatchingLabelColumns(
  columns: PColumnIdAndSpec[],
  allLabelColumns: PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor>>[],
): PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor>>[] {
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

/** Check if all columns are computed */
export function allColumnsComputed(
  columns: PColumn<PColumnValues | TreeNodeAccessor | DataInfo<TreeNodeAccessor>>[],
): boolean {
  type Data = typeof columns[number]['data'];
  const isValues = (d: Data): d is PColumnValues => Array.isArray(d);
  const isAccessor = (d: Data): d is TreeNodeAccessor => d instanceof TreeNodeAccessor;
  const isDataInfo = (d: Data): d is DataInfo<TreeNodeAccessor> =>
    typeof d === 'object' && 'type' in d;

  return columns
    .map((c) => c.data)
    .every((d): boolean => {
      if (isValues(d)) {
        return true;
      } else if (isAccessor(d)) {
        return d.getIsReadyOrError();
      } else if (isDataInfo(d)) {
        const type = d.type;
        switch (type) {
          case 'Json':
            return true;
          case 'JsonPartitioned':
            return Object.values(d.parts).every((p) => p.getIsReadyOrError());
          case 'BinaryPartitioned':
            return Object.values(d.parts)
              .every((p) => p.index.getIsReadyOrError() && p.values.getIsReadyOrError());
        }
      } else {
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw Error(`unsupported column data type: ${d satisfies never}`);
      }
    });
}

function createPTableDef(
  columns: PColumn<TreeNodeAccessor | PColumnValues | DataInfo<TreeNodeAccessor>>[],
  labelColumns: PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor>>[],
  coreJoinType: 'inner' | 'full',
  filters: PTableRecordSingleValueFilterV2[],
  sorting: PTableSorting[],
  coreColumnPredicate?: ((spec: PColumnSpec) => boolean),
): PTableDef<PColumn<TreeNodeAccessor | PColumnValues | DataInfo<TreeNodeAccessor>>> {
  let coreColumns = columns;
  const secondaryColumns: typeof columns = [];

  if (coreColumnPredicate) {
    coreColumns = [];
    for (const c of columns)
      if (coreColumnPredicate(c.spec)) coreColumns.push(c);
      else secondaryColumns.push(c);
  }

  secondaryColumns.push(...labelColumns);

  return {
    src: {
      type: 'outer',
      primary: {
        type: coreJoinType,
        entries: coreColumns.map((c) => ({ type: 'column', column: c })),
      },
      secondary: secondaryColumns.map((c) => ({ type: 'column', column: c })),
    },
    filters,
    sorting,
  };
}

/**
 * Create p-table handle given ui table state
 *
 * @param ctx context
 * @param columns column list
 * @param tableState table ui state
 * @returns PlAgDataTable table source
 */
export function createPlDataTable<A, U>(
  ctx: RenderCtx<A, U>,
  columns: PColumn<TreeNodeAccessor | PColumnValues | DataInfo<TreeNodeAccessor>>[],
  tableState: PlDataTableState | undefined
): PTableHandle | undefined;
export function createPlDataTable<A, U>(
  ctx: RenderCtx<A, U>,
  columns: PColumn<TreeNodeAccessor | PColumnValues | DataInfo<TreeNodeAccessor>>[],
  tableState: PlDataTableState | undefined,
  ops: CreatePlDataTableOps
): PTableHandle | undefined;
/** @deprecated use method with extended ops as the last argument */
export function createPlDataTable<A, U>(
  ctx: RenderCtx<A, U>,
  columns: PColumn<TreeNodeAccessor | PColumnValues | DataInfo<TreeNodeAccessor>>[],
  tableState: PlDataTableState | undefined,
  filters: PTableRecordFilter[]
): PTableHandle | undefined;
export function createPlDataTable<A, U>(
  ctx: RenderCtx<A, U>,
  columns: PColumn<TreeNodeAccessor | PColumnValues | DataInfo<TreeNodeAccessor>>[],
  tableState: PlDataTableState | undefined,
  ops?: PTableRecordFilter[] | CreatePlDataTableOps,
): PTableHandle | undefined {
  // ops migration for backward compatibility with previous deprecated API
  if (Array.isArray(ops)) {
    ops = { filters: ops };
  }

  const coreJoinType = ops?.coreJoinType ?? 'full';
  const filters: PTableRecordSingleValueFilterV2[]
    = [...(ops?.filters ?? []), ...(tableState?.pTableParams?.filters ?? [])];
  const sorting: PTableSorting[] = tableState?.pTableParams?.sorting ?? [];

  const allLabelColumns = getAllLabelColumns(ctx.resultPool);
  if (!allLabelColumns) return undefined;

  const labelColumns = getMatchingLabelColumns(columns.map(getColumnIdAndSpec), allLabelColumns);

  // if at least one column is not yet computed, we can't show the table
  if (!allColumnsComputed([...columns, ...labelColumns])) return undefined;

  return ctx.createPTable(
    createPTableDef(columns, labelColumns, coreJoinType, filters, sorting, ops?.coreColumnPredicate));
}

/** PlAgDataTable model */
export type PlDataTableModel = {
  /** p-table specification (full, including hidden columns) */
  tableSpec: PTableColumnSpec[];
  /** p-table handle (integration of visible columns data) */
  tableHandle: PTableHandle;
};

/** Key is a set of all axes values, which means it is unique across rows */
export type PTableRowKey = PTableValue[];

/** Information on selected rows */
export type RowSelectionModel = {
  /** Axes spec */
  axesSpec: AxesSpec;
  /** Row keys (arrays of axes values) of selected rows */
  selectedRowsKeys: PTableRowKey[];
};

/** Check if column should be omitted from the table */
export function isColumnHidden(spec: { annotations?: Record<string, string> }): boolean {
  return spec.annotations?.['pl7.app/table/visibility'] === 'hidden';
}

/** Check if column is hidden by default */
export function isColumnOptional(spec: { annotations?: Record<string, string> }): boolean {
  return spec.annotations?.['pl7.app/table/visibility'] === 'optional';
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
  inputColumns: PColumn<TreeNodeAccessor | PColumnValues | DataInfo<TreeNodeAccessor>>[],
  mainColumnPredicate: (spec: PColumnSpec) => boolean,
  tableState: PlDataTableState | undefined,
  ops?: CreatePlDataTableOps,
): PlDataTableModel | undefined {
  const coreJoinType = ops?.coreJoinType ?? 'full';
  const filters: PTableRecordSingleValueFilterV2[]
    = [...(ops?.filters ?? []), ...(tableState?.pTableParams?.filters ?? [])];
  const sorting: PTableSorting[] = tableState?.pTableParams?.sorting ?? [];
  const columns = inputColumns.filter((c) => !isColumnHidden(c.spec));

  const mainColumn = columns.find((c) => mainColumnPredicate(c.spec));
  if (!mainColumn) return undefined;

  const allLabelColumns = getAllLabelColumns(ctx.resultPool);
  if (!allLabelColumns) return undefined;

  const hiddenColumns = new Set<PObjectId>(((): PObjectId[] => {
    // Inner join works as a filter - all columns must be present
    if (coreJoinType === 'inner') return [];

    const hiddenColIds = tableState?.gridState.columnVisibility?.hiddenColIds
      ?.map(parsePTableColumnId)
      .filter((c) => c.type === 'column')
      .map((c) => c.id);
    if (hiddenColIds) return hiddenColIds;

    return columns
      .filter((c) => isColumnOptional(c.spec))
      .map((c) => c.id);
  })());

  // Main column must always be included in join to integrate all other columns
  hiddenColumns.delete(mainColumn.id);
  // Filters decrease the number of result rows, sorting changes the order of result rows
  [...filters.map((f) => f.column), ...sorting.map((s) => s.column)]
    .filter((c): c is PTableColumnIdColumn => c.type === 'column')
    .map((c) => hiddenColumns.delete(c.id));

  const visibleColumns = columns.filter((c) => !hiddenColumns.has(c.id));
  const labelColumns = getMatchingLabelColumns(visibleColumns.map(getColumnIdAndSpec), allLabelColumns);

  const spec: PTableColumnSpec[] = [
    ...mainColumn.spec.axesSpec.map((axis) => ({
      type: 'axis',
      id: getAxisId(axis),
      spec: axis,
    } satisfies PTableColumnSpec)),
    ...[...columns, ...labelColumns].map((c) => ({
      type: 'column',
      id: c.id,
      spec: c.spec,
    } satisfies PTableColumnSpec)),
  ];

  // if at least one column is not yet computed, we can't show the table
  if (!allColumnsComputed([...visibleColumns, ...labelColumns])) return undefined;

  const handle = ctx.createPTable(
    createPTableDef(columns, labelColumns, coreJoinType, filters, sorting, ops?.coreColumnPredicate));

  return {
    tableSpec: spec,
    tableHandle: handle,
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
