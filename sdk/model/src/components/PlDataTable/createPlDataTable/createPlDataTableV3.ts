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
import type { ColumnMatch, ColumnSnapshot, MatchingMode } from "../../../columns";
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
import { discoverTableColumnSnaphots, type DiscoveredTableColumnOptions } from "./discoverColumns";
import { isNil, RequiredBy, throwError, type Nil } from "@milaboratories/helpers";

export type createPlDataTableOptionsV3 = (
  | {
      discoverColumnOptions: DiscoveredTableColumnOptions;
    }
  | {
      columns: Nil | TableColumnSnapshot<SUniversalPColumnId>[];
    }
) & {
  filters?: PlDataTableFilters;
  sorting?: PTableSorting[];
  primaryJoinType?: "inner" | "full";

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
  const primaryJoinType = options.primaryJoinType ?? "full";

  const discovered =
    "discoverColumnOptions" in options
      ? discoverTableColumnSnaphots(ctx, options.discoverColumnOptions)
      : options.columns;
  if (isNil(discovered) || discovered.length === 0) return undefined;

  const splited = splitDiscoveredColumns(discovered);
  const resolved = resolveDiscoveredColumns(splited, discovered);

  const labelColumns = getMatchingLabelColumns(resolved.all, getAllLabelColumns(ctx));

  const derivedLabels = deriveAllLabels({
    columns: discovered.map((dc) => ({
      id: dc.id,
      spec: dc.spec,
      linkerPath: dc.linkerPath?.map((lp) => ({ spec: lp.linker.spec })),
    })),
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

  const filters = state.pTableParams.filters;
  const defaultFilters = remapFilterColumnIds(options.filters, discovered) ?? undefined;
  validateFilters(filters, columnIsAvailable);
  validateFilters(defaultFilters, columnIsAvailable);

  const sorting = resolveSorting(
    state.pTableParams.sorting,
    remapSortingColumnIds(options.sorting, discovered),
  );
  validateSorting(sorting, columnIsAvailable);

  const primaryColumnIds = new Set<PObjectId>(
    discovered.filter((dc) => dc.isPrimary).map((dc) => dc.id),
  );
  const primaryColumns = annotated.direct.filter((c) => primaryColumnIds.has(c.id));
  const secondaryColumns = annotated.direct.filter((c) => !primaryColumnIds.has(c.id));

  if (primaryColumns.length === 0) return undefined;

  const fullDef = createPTableDefV3({
    primaryJoinType,
    primaryColumns,
    secondaryGroups: [
      ...secondaryColumns.map((c) => [c]),
      ...annotated.linked.map((lc) => [...(annotated.linkers.get(lc.id) ?? []), lc]),
      ...annotated.labels.map((c) => [c]),
    ],
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

  const hiddenSpecs = state.pTableParams.hiddenColIds;

  const hiddenColumnIds = computeHiddenColumns(
    [...annotated.direct, ...annotated.linked],
    sorting,
    filters,
    hiddenSpecs,
  );

  const visible = buildVisibleColumns(annotated, hiddenColumnIds, labelColumns);
  const visibleNonCoreDirect = secondaryColumns.filter((c) => !hiddenColumnIds.has(c.id));
  const visibleLinkedGroups = buildVisibleLinkedGroups(
    visible.direct,
    visible.linked,
    annotated.linkers,
    hiddenSpecs,
  );

  const visibleDef = createPTableDefV3({
    primaryJoinType,
    primaryColumns,
    secondaryGroups: [
      ...visibleNonCoreDirect.map((c) => [c]),
      ...visibleLinkedGroups,
      ...visible.labels.map((c) => [c]),
    ],
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
    defaultFilters,
  } satisfies PlDataTableModel;
}

/** A single column discovered from sources — normalized from raw ColumnSnapshot/ColumnMatch. */
export type TableColumnSnapshot<Id extends PObjectId | SUniversalPColumnId> = ColumnSnapshot<Id> & {
  readonly isPrimary?: boolean;
  readonly originalId?: PObjectId;
  readonly linkerPath?: ColumnMatch["path"];
};

type TableColumn = PColumn<undefined | PColumnDataUniversal>;

type SplitDiscoveredColumns = {
  readonly direct: TableColumnSnapshot<SUniversalPColumnId>[];
  readonly linked: TableColumnSnapshot<SUniversalPColumnId>[];
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
  readonly direct: TableColumn[];
  readonly linked: TableColumn[];
  readonly labels: PColumn<PColumnDataUniversal>[];
};

/** Split discovered columns into direct (no linker path) and linked (with linker path). */
function splitDiscoveredColumns(
  columns: TableColumnSnapshot<SUniversalPColumnId>[],
): SplitDiscoveredColumns {
  return {
    direct: columns.filter((dc) => isNil(dc.linkerPath) || dc.linkerPath.length === 0),
    linked: columns.filter((dc) => !isNil(dc.linkerPath) && dc.linkerPath.length > 0),
  };
}

/** Resolve DiscoveredColumn snapshots into PColumn objects with lazily-evaluated data. */
function resolveDiscoveredColumns(
  split: SplitDiscoveredColumns,
  allDiscovered: TableColumnSnapshot<SUniversalPColumnId>[],
): ResolvedColumns {
  const linked = split.linked.map(resolveSnapshot);
  const linkers = new Map<PObjectId, TableColumn[]>(
    split.linked
      .filter(
        (dc): dc is RequiredBy<TableColumnSnapshot<SUniversalPColumnId>, "linkerPath"> =>
          !isNil(dc.linkerPath),
      )
      .map((dc, i) => [linked[i].id, dc.linkerPath.map((s) => resolveSnapshot(s.linker))]),
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
  columns: TableColumn[],
  sorting: Nil | PTableSorting[],
  filters: Nil | PlDataTableFilters,
  hiddenSpecs: Nil | PTableColumnId[],
): Set<PObjectId> {
  const alwaysHidden = columns.filter((c) => isColumnHidden(c.spec)).map((c) => c.id);
  const optionalHidden = !isNil(hiddenSpecs)
    ? hiddenSpecs.filter((s): s is PTableColumnIdColumn => s.type === "column").map((s) => s.id)
    : columns.filter((c) => isColumnOptional(c.spec)).map((c) => c.id);
  const initial = [...alwaysHidden, ...optionalHidden];
  const preserved = collectPreservedColumnIds(sorting, filters);

  return new Set(initial.filter((id) => !preserved.has(id)));
}

/**
 * Build visible linked column groups. Non-hidden groups are included fully;
 * hidden groups are trimmed to only the prefix that brings axes not yet
 * covered by earlier groups (visible or previously trimmed).
 */
function buildVisibleLinkedGroups(
  direct: TableColumn[],
  linked: TableColumn[],
  linkers: Map<PObjectId, TableColumn[]>,
  hiddenSpecs: PTableColumnId[] | null,
): TableColumn[][] {
  const result: TableColumn[][] = [];
  const coveredAxisIds = new Set<CanonicalizedJson<AxisId>>();

  const collectAxes = (group: TableColumn[]) => {
    for (const col of group) {
      for (const as of col.spec.axesSpec) {
        coveredAxisIds.add(canonicalizeJson(getAxisId(as)));
      }
    }
  };

  collectAxes(direct);

  for (const lc of linked) {
    const group = [...(linkers.get(lc.id) ?? []), lc];
    result.push(group);
    collectAxes(group);
  }

  for (const group of linkers.values()) {
    const trimmed = trimGroupByVisibleAxes(group, hiddenSpecs, coveredAxisIds);
    if (trimmed.length > 0) {
      result.push(trimmed);
      collectAxes(trimmed);
    }
  }

  return result;
}

/**
 * For a linked column group [linker1, ..., linkerN, column], find the rightmost
 * element that has at least one non-hidden and not-yet-covered axis.
 * Return the prefix up to and including that element.
 * If no element has such an axis, return empty array.
 */
function trimGroupByVisibleAxes(
  group: TableColumn[],
  hiddenSpecs: PTableColumnId[] | null,
  coveredAxisIds: Set<CanonicalizedJson<AxisId>>,
): TableColumn[] {
  if (hiddenSpecs === null) return group;

  const hiddenAxisIds = new Set(
    hiddenSpecs
      .filter((s): s is PTableColumnIdAxis => s.type === "axis")
      .map((s) => canonicalizeJson(s.id)),
  );

  const uncoveredAxisIds = new Set(
    group
      .flatMap((c) => c.spec.axesSpec.map((as) => canonicalizeJson(getAxisId(as))))
      .filter((id) => !hiddenAxisIds.has(id) && !coveredAxisIds.has(id)),
  );

  let lastNeeded = -1;
  for (let i = 0; i < group.length; i++) {
    const newAxes = group[i].spec.axesSpec
      .map((as) => canonicalizeJson(getAxisId(as)))
      .filter((id) => uncoveredAxisIds.has(id));
    if (newAxes.length > 0) {
      for (const id of newAxes) uncoveredAxisIds.delete(id);
      lastNeeded = i;
    }
  }
  return lastNeeded === -1 ? [] : group.slice(0, lastNeeded + 1);
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
  const labels = getMatchingLabelColumns(
    [...direct, ...linked].map(getColumnIdAndSpec),
    originalLabelColumns,
  );
  return { direct, linked, labels };
}

/** Resolve a ColumnSnapshot to a PColumn with lazily-evaluated data. */
function resolveSnapshot(
  snap: ColumnSnapshot<PObjectId>,
): PColumn<undefined | PColumnDataUniversal> {
  return { id: snap.id, spec: snap.spec, data: snap.data?.get() };
}

/** Remap column references in sorting entries. */
function remapSortingColumnIds(
  sorting: Nil | PTableSorting[],
  columns: TableColumnSnapshot<PObjectId | SUniversalPColumnId>[],
): Nil | PTableSorting[] {
  return sorting?.map((s) => {
    if (s.column.type === "axis") return s; // Axis references are unaffected by column ID remapping

    const id = s.column.id;
    const column =
      columns.find((c) => (c.originalId ?? c.id) === id) ??
      throwError(`Column ID "${id}" in sorting does not match any discovered column`);

    return {
      ...s,
      column: {
        type: "column",
        id: column.id,
      },
    };
  });
}

type PlDataTableFilterNode = FilterSpecNode<PlDataTableFilterSpecLeaf>;

/** Remap column references in a filter tree. */
function remapFilterColumnIds(
  filters: Nil | PlDataTableFilters,
  columns: TableColumnSnapshot<PObjectId | SUniversalPColumnId>[],
): Nil | PlDataTableFilters {
  if (isNil(filters)) return filters;

  const map = (
    tableColumnId: CanonicalizedJson<PTableColumnId>,
  ): CanonicalizedJson<PTableColumnId> => {
    const parsed = parseJson<PTableColumnId>(tableColumnId);
    if (parsed.type === "axis") return tableColumnId; // Axis references are unaffected by column ID remapping

    const originalId = parsed.id;
    const column =
      columns.find((c) => (c.originalId ?? c.id) === originalId) ??
      throwError(`Column ID "${parsed.id}" in filters does not match any discovered column`);

    return canonicalizeJson<PTableColumnId>({
      type: "column",
      id: column.id,
    });
  };

  return traverseFilterSpec(filters, {
    leaf: (leaf): PlDataTableFilterNode => {
      if (leaf.type === undefined) return leaf;
      const result = { ...leaf };
      if ("column" in result) result.column = map(result.column);
      if ("rhs" in result) result.rhs = map(result.rhs);
      return result;
    },
    and: (results): PlDataTableFilterNode => ({ type: "and", filters: results }),
    or: (results): PlDataTableFilterNode => ({ type: "or", filters: results }),
    not: (result): PlDataTableFilterNode => ({ type: "not", filter: result }),
  }) as PlDataTableFilters;
}
