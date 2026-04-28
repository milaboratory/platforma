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
  PFrameSpecDriver,
  DiscoveredPColumnId,
} from "@milaboratories/pl-model-common";
import { canonicalizeJson, getAxisId, parseJson, uniqueBy } from "@milaboratories/pl-model-common";
import { collectFilterSpecColumns, traverseFilterSpec } from "../../../filters/traverse";
import type { RenderCtxBase, PColumnDataUniversal } from "../../../render";
import { isEmpty } from "es-toolkit/compat";
import type { PlDataTableFilters, PlDataTableFilterSpecLeaf, PlDataTableModel } from "../typesV5";
import { upgradePlDataTableStateV2 } from "../state-migration";
import type { PlDataTableStateV2 } from "../state-migration";
import type { ColumnSelector, ColumnSnapshot, ColumnVariant, MatchingMode } from "../../../columns";
import { getAllLabelColumns, getMatchingLabelColumns } from "../labels";
import type { DeriveLabelsOptions } from "../../../labels/derive_distinct_labels";
import {
  deriveAllLabels,
  deriveAllTooltips,
  evaluateRules,
  isColumnHidden,
  isColumnOptional,
  withHidenAxesAnnotations,
  withLabelAnnotations,
  withTableVisualAnnotations,
  withInfoAnnotations,
} from "./utils";
import type { PrimaryEntry, SecondaryGroup } from "./createPTableDefV3";
import { createPTableDefV3 } from "./createPTableDefV3";
import { discoverTableColumnSnaphots, type DiscoverTableColumnOptions } from "./discoverColumns";
import { isNil, isPlainObject, throwError, type Nil } from "@milaboratories/helpers";

export type createPlDataTableOptionsV3 = {
  tableState?: PlDataTableStateV2;

  columns: Nil | DiscoverTableColumnOptions | TableColumnVariant[];
  filters?: PlDataTableFilters;
  sorting?: PTableSorting[];
  primaryJoinType?: "inner" | "full";

  labelsOptions?: DeriveLabelsOptions;
  displayOptions?: ColumnsDisplayOptions;
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
  match: ColumnMatcher | ColumnSelector;
  /** Higher number = further left in table */
  priority: number;
};

export type ColumnVisibilityRule = {
  match: ColumnMatcher | ColumnSelector;
  visibility: "default" | "optional" | "hidden";
};

export type ColumnMatcher = (spec: PColumnSpec) => boolean;

// Main Function

export function createPlDataTableV3<A, U>(
  ctx: RenderCtxBase<A, U>,
  options: createPlDataTableOptionsV3,
): PlDataTableModel | undefined {
  const pframeSpec = ctx.getService("pframeSpec");
  const state = upgradePlDataTableStateV2(options.tableState);
  const primaryJoinType = options.primaryJoinType ?? "full";

  const discovered = isPlainObject(options.columns)
    ? discoverTableColumnSnaphots(ctx, options.columns)
    : options.columns;
  if (isNil(discovered) || discovered.length === 0) return undefined;

  const splited = splitDiscoveredColumns(discovered);

  const labelColumns = getMatchingLabelColumns(
    [...splited.direct, ...splited.linked].map((v) => v.column),
    getAllLabelColumns(ctx),
  );

  const derivedLabels = deriveAllLabels({
    columns: discovered.map((dc) => ({
      id: dc.column.id,
      spec: dc.column.spec,
      linkerPath: dc.path,
      qualifications: dc.qualifications,
    })),
    labelColumns,
    deriveLabelsOptions: {
      includeNativeLabel: true,
      ...options.labelsOptions,
    },
  });

  const derivedTooltips = deriveAllTooltips({
    columns: discovered.map((dc) => ({
      id: dc.column.id,
      originalId: dc.originalId,
      spec: dc.column.spec,
      linkerPath: dc.path,
      qualifications: dc.qualifications,
    })),
  });

  const annotated = annotateColumnGroups({
    pframeSpec,
    ...splited,
    labelColumns,
    derivedLabels,
    derivedTooltips,
    displayOptions: options.displayOptions,
  });

  const primarySnapshots = annotated.direct.filter((c) => c.isPrimary);
  const secondarySnapshots = annotated.direct.filter((c) => !c.isPrimary);

  if (primarySnapshots.length === 0) return undefined;

  const columnIsAvailable = createColumnValidationById([
    ...annotated.direct.map((v) => v.column),
    ...annotated.linked.flatMap((lc) => [...lc.path.map((s) => s.linker), lc.column]),
    ...annotated.labels,
  ]);

  const remapedDefaultFilters = remapFilterColumnIds(options.filters, discovered);
  const filters = concatFilters(
    state.pTableParams.filters,
    state.pTableParams.defaultFilters ?? remapedDefaultFilters,
  );
  validateFilters(filters, columnIsAvailable);

  const sorting = resolveSorting(
    state.pTableParams.sorting,
    remapSortingColumnIds(options.sorting, discovered),
  );
  validateSorting(sorting, columnIsAvailable);

  const primaryEntries: PrimaryEntry<undefined | PColumnDataUniversal>[] = primarySnapshots.map(
    (v) => ({ column: resolveSnapshot(v.column) }),
  );
  const fullDef = createPTableDefV3({
    primaryJoinType,
    primary: primaryEntries,
    secondary: buildSecondaryGroups(secondarySnapshots, annotated.linked, annotated.labels),
    filters,
    sorting,
  });

  const fullHandle = ctx.createPTableV2(fullDef);
  // TODO: is workaround for dropdown suggestions.
  // Pframe have not equivalent data for columns relativly to Ptable
  const pframeHandle = ctx.createPFrame([
    ...annotated.direct.map((v) => resolveSnapshot(v.column)),
    ...annotated.linked.map((v) => resolveSnapshot(v.column)),
    ...annotated.labels,
    ...collectLinkerSnapshots(annotated.linked).map(resolveSnapshot),
  ]);

  const hiddenSpecs = state.pTableParams.hiddenColIds;
  const hiddenColumnIds = computeHiddenColumns(
    [...annotated.direct, ...annotated.linked].map((v) => v.column),
    sorting,
    filters,
    hiddenSpecs,
  );

  const visible = buildVisibleColumns(annotated, hiddenColumnIds, labelColumns);
  const visibleDef = createPTableDefV3({
    primaryJoinType,
    primary: primaryEntries,
    secondary: buildSecondaryGroups(
      visible.direct.filter((c) => !c.isPrimary),
      visible.linked,
      visible.labels,
    ),
    filters,
    sorting,
  });
  const visibleHandle = ctx.createPTableV2(visibleDef);

  return {
    sourceId: state.pTableParams.sourceId,
    fullTableHandle: fullHandle,
    fullPframeHandle: pframeHandle,
    visibleTableHandle: visibleHandle,
    defaultFilters: remapedDefaultFilters,
  } satisfies PlDataTableModel;
}

export type TableColumnVariant = ColumnVariant<DiscoveredPColumnId> & {
  readonly originalId: PObjectId;
  readonly isPrimary?: boolean;
};

type SplitDiscoveredColumns = {
  readonly direct: TableColumnVariant[];
  readonly linked: TableColumnVariant[];
};

type AnnotatedColumnGroups = {
  readonly direct: TableColumnVariant[];
  readonly linked: TableColumnVariant[];
  readonly labels: PColumn<PColumnDataUniversal>[];
};

type VisibleColumns = {
  readonly direct: TableColumnVariant[];
  readonly linked: TableColumnVariant[];
  readonly labels: PColumn<PColumnDataUniversal>[];
};

/** Split discovered columns into direct (no linker path) and linked (with linker path). */
function splitDiscoveredColumns(columns: TableColumnVariant[]): SplitDiscoveredColumns {
  const direct = columns.filter((dc) => dc.path.length === 0);
  const linked = columns.filter((dc) => dc.path.length > 0);
  return { direct, linked };
}

/** All linker snapshots across the given linked columns, deduped by id. */
function collectLinkerSnapshots(linked: TableColumnVariant[]): ColumnSnapshot<PObjectId>[] {
  return uniqueBy(
    linked.flatMap((lc) => lc.path.map((s) => s.linker)),
    (c) => c.id,
  );
}

/**
 * Annotate all column groups with derived labels and display-rule annotations.
 * Evaluates `displayOptions` rules against all discovered columns (direct,
 * linked, labels, linkers) and writes the winning visibility/priority into
 * column annotations via `withTableVisualAnnotations`.
 */
function annotateColumnGroups(params: {
  direct: TableColumnVariant[];
  linked: TableColumnVariant[];
  labelColumns: PColumn<PColumnDataUniversal>[];
  derivedLabels: Record<string, string>;
  derivedTooltips: Record<string, string>;
  displayOptions?: ColumnsDisplayOptions;
  pframeSpec: PFrameSpecDriver;
}): AnnotatedColumnGroups {
  const {
    direct,
    linked,
    labelColumns,
    derivedLabels,
    derivedTooltips,
    displayOptions,
    pframeSpec,
  } = params;

  const allColumnsForRules = [
    ...direct.map((v) => v.column),
    ...linked.map((v) => v.column),
    ...labelColumns,
    ...collectLinkerSnapshots(linked),
  ];
  const visibilityByColId = evaluateRules(
    displayOptions?.visibility ?? [],
    allColumnsForRules,
    pframeSpec,
  );
  const orderByColId = evaluateRules(
    displayOptions?.ordering ?? [],
    allColumnsForRules,
    pframeSpec,
  );

  const directAnnotated = withVariantColumns(direct, (cols) =>
    withTableVisualAnnotations(
      visibilityByColId,
      orderByColId,
      withInfoAnnotations(derivedTooltips, withLabelAnnotations(derivedLabels, cols)),
    ),
  );

  const linkedAnnotated = withVariantColumns(linked, (cols) =>
    withTableVisualAnnotations(
      visibilityByColId,
      orderByColId,
      withHidenAxesAnnotations(
        withInfoAnnotations(derivedTooltips, withLabelAnnotations(derivedLabels, cols)),
      ),
    ),
  ).map((lc) => ({ ...lc, path: annotateLinkerPath(derivedLabels, lc.path) }));

  const labelColumnsAnnotated = withLabelAnnotations(derivedLabels, labelColumns);

  return {
    direct: directAnnotated,
    linked: linkedAnnotated,
    labels: labelColumnsAnnotated,
  };
}

/** Apply a snapshot-array transformation to the inner `column` of each variant. */
function withVariantColumns<V extends { readonly column: ColumnSnapshot<DiscoveredPColumnId> }>(
  variants: V[],
  fn: (cols: ColumnSnapshot<DiscoveredPColumnId>[]) => ColumnSnapshot<DiscoveredPColumnId>[],
): V[] {
  const cols = fn(variants.map((v) => v.column));
  return variants.map((v, i) => ({ ...v, column: cols[i] }));
}

function annotateLinkerPath(
  derivedLabels: Record<string, string>,
  path: TableColumnVariant["path"],
): TableColumnVariant["path"] {
  if (path.length === 0) return path;
  const annotatedLinkers = withHidenAxesAnnotations(
    withLabelAnnotations(
      derivedLabels,
      path.map((s) => s.linker),
    ),
  );
  return path.map((s, i) => ({ ...s, linker: annotatedLinkers[i] }));
}

/** Build an index of all valid column IDs (axes + columns) for filter/sorting validation. */
function createColumnValidationById(
  fullColumns: { readonly id: PObjectId; readonly spec: PColumnSpec }[],
) {
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

/** Merge two filter trees into one AND-combined tree. Returns the non-nil one if the other is nil. */
function concatFilters(
  a: Nil | PlDataTableFilters,
  b: Nil | PlDataTableFilters,
): Nil | PlDataTableFilters {
  if (isNil(a)) return b;
  if (isNil(b)) return a;
  return { ...a, filters: [...a.filters, ...b.filters] };
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

function buildSecondaryGroups(
  direct: TableColumnVariant[],
  linked: TableColumnVariant[],
  labels: PColumn<PColumnDataUniversal>[],
): SecondaryGroup<undefined | PColumnDataUniversal>[] {
  return [
    ...direct.map(
      (c): SecondaryGroup<undefined | PColumnDataUniversal> => ({
        entries: [{ column: resolveSnapshot(c.column), qualifications: c.qualifications.forHit }],
        primaryQualifications: c.qualifications.forQueries,
      }),
    ),
    ...linked.map(
      (lc): SecondaryGroup<undefined | PColumnDataUniversal> => ({
        entries: [
          ...lc.path.map((s) => ({
            column: resolveSnapshot(s.linker),
            qualifications: s.qualifications,
          })),
          { column: resolveSnapshot(lc.column), qualifications: lc.qualifications.forHit },
        ],
        primaryQualifications: lc.qualifications.forQueries,
      }),
    ),
    ...labels.map(
      (c): SecondaryGroup<undefined | PColumnDataUniversal> => ({ entries: [{ column: c }] }),
    ),
  ];
}

/** Determine which columns should be hidden based on state or optional-column defaults. */
function computeHiddenColumns(
  columns: { readonly id: PObjectId; readonly spec: PColumnSpec }[],
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
  const direct = annotated.direct.filter((c) => !hiddenColumns.has(c.column.id));
  const linked = annotated.linked.filter((c) => !hiddenColumns.has(c.column.id));
  const labels = getMatchingLabelColumns(
    [...direct, ...linked].map((v) => v.column),
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
  columns: TableColumnVariant[],
): Nil | PTableSorting[] {
  return sorting?.map((s) => {
    if (s.column.type === "axis") return s; // Axis references are unaffected by column ID remapping

    const id = s.column.id;
    const column =
      columns.find((c) => (c.originalId ?? c.column.id) === id) ??
      throwError(`Column ID "${id}" in sorting does not match any discovered column`);

    return {
      ...s,
      column: {
        type: "column",
        id: column.column.id,
      },
    };
  });
}

type PlDataTableFilterNode = FilterSpecNode<PlDataTableFilterSpecLeaf>;

/** Remap column references in a filter tree. */
function remapFilterColumnIds(
  filters: Nil | PlDataTableFilters,
  columns: TableColumnVariant[],
): Nil | PlDataTableFilters {
  if (isNil(filters)) return filters;

  const map = (
    tableColumnId: CanonicalizedJson<PTableColumnId>,
  ): CanonicalizedJson<PTableColumnId> => {
    const parsed = parseJson<PTableColumnId>(tableColumnId);
    if (parsed.type === "axis") return tableColumnId; // Axis references are unaffected by column ID remapping

    const originalId = parsed.id;
    const column =
      columns.find((c) => (c.originalId ?? c.column.id) === originalId) ??
      throwError(`Column ID "${parsed.id}" in filters does not match any discovered column`);

    return canonicalizeJson<PTableColumnId>({
      type: "column",
      id: column.column.id,
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
