import type {
  AxisId,
  CanonicalizedJson,
  DiscoverColumnsStepInfo,
  PColumn,
  PColumnIdAndSpec,
  PObjectId,
  PTableColumnId,
  PTableColumnIdAxis,
  PTableColumnIdColumn,
  PTableSorting,
  PColumnSpec,
  MultiColumnSelector,
  SUniversalPColumnId,
} from "@milaboratories/pl-model-common";
import {
  canonicalizeJson,
  getAxisId,
  getColumnIdAndSpec,
  parseJson,
  uniqueBy,
} from "@milaboratories/pl-model-common";
import { collectFilterSpecColumns } from "../../../filters/traverse";
import type { RenderCtxBase, PColumnDataUniversal } from "../../../render";
import { isEmpty } from "es-toolkit/compat";
import type { PlDataTableFilters, PlDataTableModel } from "../typesV5";
import { upgradePlDataTableStateV2 } from "../state-migration";
import type { PlDataTableStateV2 } from "../state-migration";
import type { ColumnSnapshot, MatchingMode, SplitAxis } from "../../../columns";
import { expandByPartition } from "../../../columns";
import { Services, type RequireServices } from "@milaboratories/pl-model-common";
import { getAllLabelColumns, getMatchingLabelColumns } from "../labels";
import type { DeriveLabelsOptions } from "../../../labels/derive_distinct_labels";
import {
  deriveAllLabels,
  isColumnHidden,
  isColumnOptional,
  withLabelAnnotations,
  withTableVisualAnnotations,
  type LabelableColumn,
} from "./utils";
import { createPTableDefV3 } from "./createPTableDefV3";
import { discoverColumns, type DiscoveredColumnOptions } from "./discoverColumns";
import { isNil, type Nil } from "@milaboratories/helpers";

export type createPlDataTableOptionsV3 = DiscoveredColumnOptions & {
  filters?: PlDataTableFilters;
  sorting?: PTableSorting[];
  coreJoinType?: "inner" | "full";

  /**
   * Custom predicate to select core columns. Core columns are joined together
   * (inner or full, controlled by coreJoinType) and define the row universe.
   * Non-core columns are left-joined onto the core result.
   *
   * When omitted, anchor columns (isAnchor flag from discovery) are used as core.
   * Overrides `splitAxes.asCore` when both are provided.
   */
  coreColumnPredicate?: (spec: PColumnIdAndSpec) => boolean;

  /**
   * Split matching columns along partition axes (e.g. split abundance by sampleId).
   * Matched columns are expanded by partition — one output per key combination —
   * with split axes removed from spec and trace annotations added.
   * Expanded columns replace originals in the table.
   * When `asCore` is true, expanded columns become core (defining the row universe).
   */
  splitAxes?: SplitAxesConfig;

  tableState?: PlDataTableStateV2;
  labelsOptions?: DeriveLabelsOptions;
  columnsDisplayOptions?: ColumnsDisplayOptions;
};

/** Structured source config — selectors/anchors instead of raw ColumnSource. */
export type ColumnsSelectorConfig = {
  include?: MultiColumnSelector | MultiColumnSelector[];
  exclude?: MultiColumnSelector | MultiColumnSelector[];
  mode?: MatchingMode;
  maxHops?: number;
};

export type ColumnsDisplayOptions = {
  /** Column ordering rules. Higher priority = further left. First matching rule wins. */
  ordering?: ColumnOrderRule[];
  /** Column visibility rules. First matching rule wins. Unmatched columns use default visibility. */
  visibility?: ColumnVisibilityRule[];
};

export type ColumnOrderRule = {
  match: ColumnMatcher;
  /** Higher number = further left in table */
  priority: number;
};

export type ColumnVisibilityRule = {
  match: ColumnMatcher;
  visibility: "default" | "optional" | "hidden";
};

export type ColumnMatcher = (spec: PColumnSpec) => boolean;

/**
 * Axis splitting config for columns matching a predicate.
 * Matched columns are expanded by partition (one output per key combination),
 * with split axes removed from their spec and trace annotations added.
 */
export type SplitAxesConfig = {
  /** Which columns to split. */
  match: ColumnMatcher;
  /** Axis indices to split on. */
  axes: SplitAxis[];
  /** Whether expanded columns should be core (defining the row universe). Default: false. */
  asCore?: boolean;
};

// Main Function

export function createPlDataTableV3<A, U, S extends RequireServices<typeof Services.PFrameSpec>>(
  ctx: RenderCtxBase<A, U, S>,
  options: createPlDataTableOptionsV3,
): PlDataTableModel | undefined {
  const input = resolveColumns(ctx, options);
  if (!input) return undefined;

  return buildTable(ctx, input, options);
}

/** Discover columns, optionally split by partition axes, and prepare for the table pipeline. */
function resolveColumns<A, U, S extends RequireServices<typeof Services.PFrameSpec>>(
  ctx: RenderCtxBase<A, U, S>,
  options: createPlDataTableOptionsV3,
): ResolvedTableInput | undefined {
  let discovered = discoverColumns(ctx, options);
  if (discovered === undefined || discovered.length === 0) return undefined;

  // Apply axis splitting: expand matched columns, replace originals
  let expandedIds: Set<PObjectId> | undefined;
  if (options.splitAxes) {
    const result = applyAxisSplitting(discovered, options.splitAxes);
    if (!result) return undefined; // partition data not ready
    discovered = result.columns;
    expandedIds = result.expandedIds;
  }

  const split = splitDiscoveredColumns(discovered);
  const resolved = resolveDiscoveredColumns(split, discovered);

  // Core columns: expanded split columns (if asCore) or anchor columns
  const anchorColumnIds =
    expandedIds && options.splitAxes?.asCore
      ? expandedIds
      : new Set<PObjectId>(discovered.filter((dc) => dc.isAnchor).map((dc) => dc.id));

  const labelableColumns: LabelableColumn[] = discovered.map((dc) => ({
    id: dc.id as PObjectId,
    spec: dc.spec,
    linkerPath: dc.linkerPath,
  }));

  return { labelableColumns, resolved, anchorColumnIds };
}

/** Shared pipeline: labels → annotate → core/non-core → table defs → handles. */
function buildTable<A, U, S extends RequireServices<typeof Services.PFrameSpec>>(
  ctx: RenderCtxBase<A, U, S>,
  input: ResolvedTableInput,
  options: createPlDataTableOptionsV3,
): PlDataTableModel | undefined {
  const state = upgradePlDataTableStateV2(options.tableState);
  const coreJoinType = options.coreJoinType ?? "full";
  const { labelableColumns, resolved, anchorColumnIds } = input;

  const labelColumns = getMatchingLabelColumns(
    resolved.all,
    getAllLabelColumns(ctx.resultPool) ?? [],
  );

  const derivedLabels = deriveAllLabels({
    columns: labelableColumns,
    labelColumns,
    deriveLabelsOptions: {
      includeNativeLabel: true,
      ...options.labelsOptions,
    },
  });

  const annotated = annotateColumnGroups(
    resolved,
    labelColumns,
    derivedLabels,
    options.columnsDisplayOptions,
  );

  const columnIsAvailable = createColumnValidationById([
    ...annotated.direct,
    ...annotated.linked.flatMap((lc) => [...(annotated.linkers.get(lc.id) ?? []), lc]),
    ...annotated.labels,
  ]);

  const filters = mergeFilters(state.pTableParams.filters, options.filters);
  validateFilters(filters, columnIsAvailable);

  const sorting = resolveSorting(state.pTableParams.sorting, options.sorting);
  validateSorting(sorting, columnIsAvailable);

  let isCoreColumn: (c: TableColumn) => boolean;
  if (options.coreColumnPredicate) {
    const predicate = options.coreColumnPredicate;
    isCoreColumn = (c) => predicate(getColumnIdAndSpec(c));
  } else {
    isCoreColumn = (c) => anchorColumnIds.has(c.id);
  }
  const coreColumns = annotated.direct.filter(isCoreColumn);
  const nonCoreDirectColumns = annotated.direct.filter((c) => !isCoreColumn(c));

  if (coreColumns.length === 0) return undefined;

  const fullDef = createPTableDefV3({
    coreColumns,
    secondaryGroups: [
      ...nonCoreDirectColumns.map((c) => [c]),
      ...annotated.linked.map((lc) => [...(annotated.linkers.get(lc.id) ?? []), lc]),
      ...annotated.labels.map((c) => [c]),
    ],
    coreJoinType,
    filters,
    sorting,
  });

  const fullHandle = ctx.createPTableV2(fullDef);
  const pframeHandle = ctx.createPFrame([
    ...annotated.direct,
    ...annotated.linked,
    ...annotated.labels,
    ...uniqueBy([...annotated.linkers.values()].flat(), (c) => c.id),
  ]);
  if (!fullHandle || !pframeHandle) return undefined;

  const hidden = computeHiddenColumns(
    state.pTableParams.hiddenColIds,
    [...annotated.direct, ...annotated.linked],
    sorting,
    filters,
  );

  const visible = buildVisibleColumns(annotated, hidden, labelColumns);
  const visibleNonCoreDirect = nonCoreDirectColumns.filter((c) => !hidden.has(c.id));

  const visibleDef = createPTableDefV3({
    coreColumns,
    secondaryGroups: [
      ...visibleNonCoreDirect.map((c) => [c]),
      ...visible.linked.map((lc) => [...(visible.linkers.get(lc.id) ?? []), lc]),
      ...visible.labels.map((c) => [c]),
    ],
    coreJoinType,
    filters,
    sorting,
  });
  const visibleHandle = ctx.createPTableV2(visibleDef);
  if (!visibleHandle) return undefined;

  return {
    sourceId: state.pTableParams.sourceId,
    fullTableHandle: fullHandle,
    fullPframeHandle: pframeHandle,
    visibleTableHandle: visibleHandle,
  } satisfies PlDataTableModel;
}

// Types

/** Resolved input for the shared table-building pipeline. */
type ResolvedTableInput = {
  /** Columns with optional linkerPath for label derivation. */
  readonly labelableColumns: LabelableColumn[];
  /** Column groups for table construction. */
  readonly resolved: ResolvedColumns;
  /** IDs of anchor columns (empty for direct mode). */
  readonly anchorColumnIds: Set<PObjectId>;
};

/** A linker step with its resolved column data. */
export type ResolvedLinkerStep = {
  readonly info: DiscoverColumnsStepInfo;
  readonly column: ColumnSnapshot<PObjectId>;
};

/** A single column discovered from sources — normalized from raw ColumnSnapshot/ColumnMatch. */
export type DiscoveredColumn<Id extends PObjectId | SUniversalPColumnId> = ColumnSnapshot<Id> & {
  readonly isAnchor: boolean;
  readonly linkerPath: ResolvedLinkerStep[];
};

type TableColumn = PColumn<undefined | PColumnDataUniversal>;

type SplitDiscoveredColumns = {
  readonly direct: DiscoveredColumn<SUniversalPColumnId>[];
  readonly linked: DiscoveredColumn<SUniversalPColumnId>[];
};

type ResolvedColumns = {
  readonly direct: TableColumn[];
  readonly linked: TableColumn[];
  readonly linkers: Map<PObjectId, TableColumn[]>;
  readonly all: TableColumn[];
};

type AnnotatedColumnGroups = {
  readonly direct: TableColumn[];
  readonly linked: TableColumn[];
  readonly linkers: Map<PObjectId, TableColumn[]>;
  readonly labels: TableColumn[];
};

type VisibleColumns = {
  readonly all: TableColumn[];
  readonly direct: TableColumn[];
  readonly linked: TableColumn[];
  readonly linkers: Map<PObjectId, TableColumn[]>;
  readonly labels: PColumn<PColumnDataUniversal>[];
};

/** Split discovered columns into direct (no linker path) and linked (with linker path). */
function splitDiscoveredColumns(
  columns: DiscoveredColumn<SUniversalPColumnId>[],
): SplitDiscoveredColumns {
  return {
    direct: columns.filter((dc) => dc.linkerPath.length === 0),
    linked: columns.filter((dc) => dc.linkerPath.length > 0),
  };
}

/** Resolve DiscoveredColumn snapshots into PColumn objects with lazily-evaluated data. */
function resolveDiscoveredColumns(
  split: SplitDiscoveredColumns,
  allDiscovered: DiscoveredColumn<SUniversalPColumnId>[],
): ResolvedColumns {
  const linked = split.linked.map(resolveSnapshot);
  const linkers = new Map<PObjectId, TableColumn[]>(
    split.linked.map((dc, i) => [
      linked[i].id,
      dc.linkerPath.map((s) => resolveSnapshot(s.column)),
    ]),
  );

  return {
    all: allDiscovered.map(resolveSnapshot),
    direct: split.direct.map(resolveSnapshot),
    linked,
    linkers,
  };
}

/** Annotate all column groups with derived labels and display options. */
function annotateColumnGroups(
  resolved: ResolvedColumns,
  labelColumns: PColumn<PColumnDataUniversal>[],
  derivedLabels: Record<string, string>,
  displayOptions: ColumnsDisplayOptions | undefined,
): AnnotatedColumnGroups {
  const direct = withTableVisualAnnotations(
    displayOptions,
    withLabelAnnotations(derivedLabels, resolved.direct),
  );
  const linked = withTableVisualAnnotations(
    displayOptions,
    withLabelAnnotations(derivedLabels, resolved.linked),
  );
  const linkers = new Map<PObjectId, TableColumn[]>(
    [...resolved.linkers].map(([id, cols]) => [id, withLabelAnnotations(derivedLabels, cols)]),
  );
  const labels = withLabelAnnotations(derivedLabels, labelColumns);

  return { direct, linked, linkers, labels };
}

/** Build an index of all valid column IDs (axes + columns) for filter/sorting validation. */
function createColumnValidationById(fullColumns: TableColumn[]) {
  const axisIds = uniqueBy(
    fullColumns.flatMap((c) => c.spec.axesSpec.map((a) => getAxisId(a))),
    (a) => canonicalizeJson<AxisId>(a),
  );

  const allIds: PTableColumnId[] = [
    ...axisIds.map((a) => ({ type: "axis", id: a }) satisfies PTableColumnIdAxis),
    ...fullColumns.map((c) => ({ type: "column", id: c.id }) satisfies PTableColumnIdColumn),
  ];

  const validIdSet = new Set(allIds.map((c) => canonicalizeJson<PTableColumnId>(c)));

  return (id: string): boolean => validIdSet.has(id as CanonicalizedJson<PTableColumnId>);
}

/** Merge filters from table state and options into a single filter spec. */
function mergeFilters(
  stateFilters: PlDataTableFilters | null,
  optionsFilters: PlDataTableFilters | null | undefined,
): Nil | PlDataTableFilters {
  const normalized = optionsFilters ?? null;
  return stateFilters !== null && normalized !== null
    ? { type: "and", filters: [stateFilters, normalized] }
    : (stateFilters ?? normalized);
}

/** Validate that all column references in filters exist in the table. */
function validateFilters(
  filters: Nil | PlDataTableFilters,
  isValidColumnId: (id: string) => boolean,
): void {
  if (filters == null) return;
  const filterColumns = collectFilterSpecColumns(filters);
  const firstInvalid = filterColumns.find((col) => !isValidColumnId(col));
  if (firstInvalid !== undefined) {
    throw new Error(
      `Invalid filter column ${firstInvalid}: column reference does not match the table columns`,
    );
  }
}

/** Pick user sorting from state if non-empty, otherwise fall back to options default. */
function resolveSorting(
  userSorting: PTableSorting[],
  defaultSorting: Nil | PTableSorting[],
): PTableSorting[] {
  return (isEmpty(userSorting) ? defaultSorting : userSorting) ?? [];
}

/** Validate that all column references in sorting exist in the table. */
function validateSorting(sorting: PTableSorting[], isValidColumnId: (id: string) => boolean): void {
  const firstInvalid = sorting.find(
    (s) => !isValidColumnId(canonicalizeJson<PTableColumnId>(s.column)),
  );
  if (firstInvalid !== undefined) {
    throw new Error(
      `Invalid sorting column ${JSON.stringify(firstInvalid.column)}: column reference does not match the table columns`,
    );
  }
}

/** Determine which columns should be hidden based on state or optional-column defaults. */
function computeHiddenColumns(
  hiddenColIds: PObjectId[] | null,
  dataColumns: TableColumn[],
  sorting: Nil | PTableSorting[],
  filters: Nil | PlDataTableFilters,
): Set<PObjectId> {
  const alwaysHidden = dataColumns.filter((c) => isColumnHidden(c.spec)).map((c) => c.id);
  const optionalHidden =
    hiddenColIds ??
    // UI will hide all optional columns by default
    dataColumns.filter((c) => isColumnOptional(c.spec)).map((c) => c.id);
  const initial = [...alwaysHidden, ...optionalHidden];
  const preserved = collectPreservedColumnIds(sorting, filters);
  return new Set(initial.filter((id) => !preserved.has(id)));
}

/** Collect IDs of columns that must remain visible (sorted, filtered). */
function collectPreservedColumnIds(
  sorting: Nil | PTableSorting[],
  filters: Nil | PlDataTableFilters,
): Set<PObjectId> {
  const sortedIds = (sorting ?? [])
    .map((s) => s.column)
    .filter((c): c is PTableColumnIdColumn => c.type === "column")
    .map((c) => c.id);

  const filterIds = !isNil(filters)
    ? collectFilterSpecColumns(filters).flatMap((c) => {
        const obj = parseJson(c);
        return obj.type === "column" ? [obj.id] : [];
      })
    : [];

  return new Set<PObjectId>([...sortedIds, ...filterIds]);
}

/** Filter annotated columns to only visible ones, re-matching label columns for the visible subset. */
function buildVisibleColumns(
  annotated: AnnotatedColumnGroups,
  hiddenColumns: Set<PObjectId>,
  originalLabelColumns: PColumn<PColumnDataUniversal>[],
): VisibleColumns {
  const direct = annotated.direct.filter((c) => !hiddenColumns.has(c.id));
  const linked = annotated.linked.filter((c) => !hiddenColumns.has(c.id));
  const linkers = new Map<PObjectId, TableColumn[]>(
    [...annotated.linkers].filter(([id]) => !hiddenColumns.has(id)),
  );
  const all: TableColumn[] = [...direct, ...linked];
  const labels = getMatchingLabelColumns(all.map(getColumnIdAndSpec), originalLabelColumns);
  return { direct, linked, linkers, all, labels };
}

/** Apply axis splitting: expand matched columns by partition, replace originals. */
function applyAxisSplitting(
  discovered: DiscoveredColumn<SUniversalPColumnId>[],
  config: SplitAxesConfig,
): { columns: DiscoveredColumn<SUniversalPColumnId>[]; expandedIds: Set<PObjectId> } | undefined {
  const toSplit = discovered.filter((dc) => config.match(dc.spec));
  const toKeep = discovered.filter((dc) => !config.match(dc.spec));

  // SUniversalPColumnId extends PObjectId, so this is safe
  const { items, complete } = expandByPartition(toSplit, config.axes);
  if (!complete) return undefined;

  const expanded: DiscoveredColumn<SUniversalPColumnId>[] = items.map((snap) => ({
    id: snap.id as SUniversalPColumnId,
    spec: snap.spec,
    dataStatus: snap.dataStatus,
    data: snap.data,
    isAnchor: false,
    linkerPath: [],
  }));

  return {
    columns: [...expanded, ...toKeep],
    expandedIds: new Set(items.map((s) => s.id)),
  };
}

/** Resolve a ColumnSnapshot to a PColumn with lazily-evaluated data. */
function resolveSnapshot(
  snap: ColumnSnapshot<PObjectId>,
): PColumn<undefined | PColumnDataUniversal> {
  return { id: snap.id, spec: snap.spec, data: snap.data?.get() };
}
