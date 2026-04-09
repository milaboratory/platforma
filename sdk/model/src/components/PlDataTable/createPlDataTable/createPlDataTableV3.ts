import type {
  AxisId,
  CanonicalizedJson,
  FilterSpecNode,
  PColumn,
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
import { collectFilterSpecColumns, traverseFilterSpec } from "../../../filters/traverse";
import type { RenderCtxBase, PColumnDataUniversal } from "../../../render";
import { isEmpty } from "es-toolkit/compat";
import type { PlDataTableFilters, PlDataTableFilterSpecLeaf, PlDataTableModel } from "../typesV5";
import { upgradePlDataTableStateV2 } from "../state-migration";
import type { PlDataTableStateV2 } from "../state-migration";
import type { ColumnSnapshot, MatchingMode } from "../../../columns";
import { Services, type RequireServices } from "@milaboratories/pl-model-common";
import { getAllLabelColumns, getMatchingLabelColumns } from "../labels";
import type { DeriveLabelsOptions } from "../../../labels/derive_distinct_labels";
import {
  deriveAllLabels,
  isColumnHidden,
  isColumnOptional,
  withLabelAnnotations,
  withTableVisualAnnotations,
} from "./utils";
import { createPTableDefV3 } from "./createPTableDefV3";
import { discoverColumns, type DiscoveredColumnOptions } from "./discoverColumns";
import { isNil, throwError, type Nil } from "@milaboratories/helpers";

export type createPlDataTableOptionsV3 = DiscoveredColumnOptions & {
  coreJoinType?: "inner" | "full";
  filters?: PlDataTableFilters;
  sorting?: PTableSorting[];

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

// Main Function

export function createPlDataTableV3<A, U, S extends RequireServices<typeof Services.PFrameSpec>>(
  ctx: RenderCtxBase<A, U, S>,
  options: createPlDataTableOptionsV3,
): PlDataTableModel | undefined {
  const state = upgradePlDataTableStateV2(options.tableState);
  const coreJoinType = options.coreJoinType ?? "full";

  const discovered = discoverColumns(ctx, options);
  if (discovered === undefined || discovered.length === 0) return undefined;

  const idMapping = buildOriginalToDiscoveredIdMapping(discovered);

  const splited = splitDiscoveredColumns(discovered);
  const resolved = resolveDiscoveredColumns(splited, discovered);

  const labelColumns = getMatchingLabelColumns(
    resolved.all,
    getAllLabelColumns(ctx.resultPool) ?? [],
  );

  const derivedLabels = deriveAllLabels({
    columns: discovered,
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

  const filters = remapFilterColumnIds(
    mergeFilters(state.pTableParams.filters, options.filters),
    idMapping,
  );
  validateFilters(filters, columnIsAvailable);

  const sorting = remapSortingColumnIds(
    resolveSorting(state.pTableParams.sorting, options.sorting),
    idMapping,
  );
  validateSorting(sorting, columnIsAvailable);

  const anchorColumnIds = new Set<PObjectId>(
    discovered.filter((dc) => dc.isAnchor).map((dc) => dc.id),
  );
  const coreColumns = annotated.direct.filter((c) => anchorColumnIds.has(c.id));
  const nonCoreDirectColumns = annotated.direct.filter((c) => !anchorColumnIds.has(c.id));

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

// Helpers

/** A linker step with its resolved column data. */
export type ResolvedLinkerStep = {
  readonly column: ColumnSnapshot<PObjectId>;
};

/** A single column discovered from sources — normalized from raw ColumnSnapshot/ColumnMatch. */
export type DiscoveredColumn<Id extends PObjectId | SUniversalPColumnId> = ColumnSnapshot<Id> & {
  readonly isAnchor: boolean;
  readonly originalId: PObjectId;
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
    fullColumns.flatMap((c) => c.spec.axesSpec.map(getAxisId)),
    (a) => canonicalizeJson<AxisId>(a),
  );

  const allIds: PTableColumnId[] = [
    ...axisIds.map((a) => ({ type: "axis", id: a }) satisfies PTableColumnIdAxis),
    ...fullColumns.map((c) => ({ type: "column", id: c.id }) satisfies PTableColumnIdColumn),
  ];

  const validIdSet = new Set(allIds.map((c) => canonicalizeJson<PTableColumnId>(c)));

  return (id: string): boolean => {
    return validIdSet.has(id as CanonicalizedJson<PTableColumnId>);
  };
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

/** Resolve a ColumnSnapshot to a PColumn with lazily-evaluated data. */
function resolveSnapshot(
  snap: ColumnSnapshot<PObjectId>,
): PColumn<undefined | PColumnDataUniversal> {
  return { id: snap.id, spec: snap.spec, data: snap.data?.get() };
}

/** Build a mapping from originalId to discovered id (first occurrence wins). */
function buildOriginalToDiscoveredIdMapping(
  discovered: DiscoveredColumn<SUniversalPColumnId>[],
): Map<PObjectId, PObjectId> {
  return discovered.reduce(
    (acc, dc) => (acc.has(dc.originalId) ? acc : acc.set(dc.originalId, dc.id)),
    new Map<PObjectId, PObjectId>(),
  );
}

/** Remap a PTableColumnId using original→discovered mapping. */
function remapPTableColumnId(
  columnId: PTableColumnId,
  mapping: Map<PObjectId, PObjectId>,
): PTableColumnId {
  return columnId.type === "column"
    ? {
        type: "column",
        id:
          mapping.get(columnId.id) ??
          throwError(
            `Column ID "${columnId.id}" not found in mapping ${JSON.stringify([...mapping.entries()])}`,
          ),
      }
    : columnId;
}

/** Remap column references in sorting entries. */
function remapSortingColumnIds(
  sorting: PTableSorting[],
  mapping: Map<PObjectId, PObjectId>,
): PTableSorting[] {
  return sorting.map((s) => ({ ...s, column: remapPTableColumnId(s.column, mapping) }));
}

type PlDataTableFilterNode = FilterSpecNode<PlDataTableFilterSpecLeaf>;

/** Remap column references in a filter tree. */
function remapFilterColumnIds(
  filters: Nil | PlDataTableFilters,
  mapping: Map<PObjectId, PObjectId>,
): Nil | PlDataTableFilters {
  if (isNil(filters)) return filters;

  const remapRef = (ref: CanonicalizedJson<PTableColumnId>): CanonicalizedJson<PTableColumnId> =>
    canonicalizeJson(remapPTableColumnId(parseJson(ref), mapping));

  return traverseFilterSpec(filters, {
    leaf: (leaf): PlDataTableFilterNode => {
      if (leaf.type === undefined) return leaf;
      const result = { ...leaf };
      if ("column" in result) result.column = remapRef(result.column);
      if ("rhs" in result) result.rhs = remapRef(result.rhs);
      return result;
    },
    and: (results): PlDataTableFilterNode => ({ type: "and", filters: results }),
    or: (results): PlDataTableFilterNode => ({ type: "or", filters: results }),
    not: (result): PlDataTableFilterNode => ({ type: "not", filter: result }),
  }) as PlDataTableFilters;
}
