import type {
  AxisId,
  CanonicalizedJson,
  DataInfo,
  PColumn,
  PColumnIdAndSpec,
  PColumnValues,
  PObjectId,
  PTableColumnId,
  PTableColumnIdAxis,
  PTableColumnIdColumn,
  PTableDefV2,
  PTableSorting,
  SpecQuery,
  SingleAxisSelector,
  SpecQueryExpression,
  SpecQueryJoinEntry,
  PColumnSpec,
  PlRef,
} from "@milaboratories/pl-model-common";
import {
  Annotation,
  canonicalizeJson,
  getAxisId,
  getColumnIdAndSpec,
  isLinkerColumn,
  readAnnotation,
  isBooleanExpression,
  parseJson,
  uniqueBy,
} from "@milaboratories/pl-model-common";
import { filterSpecToSpecQueryExpr } from "../../../filters";
import { collectFilterSpecColumns } from "../../../filters/traverse";
import type { RenderCtxBase, TreeNodeAccessor, PColumnDataUniversal } from "../../../render";
import { allPColumnsReady } from "../../../render";
import { isFunction, isNil } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import { distillFilterSpec } from "../../../filters/distill";
import type { PlDataTableFilters, PlDataTableModel } from "../typesV5";
import { upgradePlDataTableStateV2 } from "../state-migration";
import type { PlDataTableStateV2 } from "../state-migration";
import type { ColumnSelector, ColumnSource, MatchingMode } from "../../../columns";
import { ColumnCollectionBuilder } from "../../../columns";
import { isColumnProvider } from "../../../columns/column_provider";
import { collectCtxColumnProviders } from "../../../columns/ctx_column_sources";
import { getAllLabelColumns, getMatchingLabelColumns } from "../labels";

/** Convert a PTableColumnId to a SpecQueryExpression reference. */
export function columnIdToExpr(col: PTableColumnId): SpecQueryExpression {
  if (col.type === "axis") {
    return { type: "axisRef", value: col.id as SingleAxisSelector };
  }
  return { type: "columnRef", value: col.id };
}

/** Wrap a SpecQuery as a SpecQueryJoinEntry with empty qualifications. */
export function joinEntry<C>(input: SpecQuery<C>): SpecQueryJoinEntry<C> {
  return { entry: input, qualifications: [] };
}

export function createPTableDef(params: {
  columns: PColumn<PColumnDataUniversal>[];
  labelColumns: PColumn<PColumnDataUniversal>[];
  coreJoinType: "inner" | "full";
  filters: null | PlDataTableFilters;
  sorting: PTableSorting[];
  coreColumnPredicate?: (spec: PColumnIdAndSpec) => boolean;
}): PTableDefV2<PColumn<TreeNodeAccessor | PColumnValues | DataInfo<TreeNodeAccessor>>> {
  let coreColumns = params.columns;
  const secondaryColumns: typeof params.columns = [];

  if (isFunction(params.coreColumnPredicate)) {
    coreColumns = [];
    for (const c of params.columns)
      if (params.coreColumnPredicate(getColumnIdAndSpec(c))) coreColumns.push(c);
      else secondaryColumns.push(c);
  }

  secondaryColumns.push(...params.labelColumns);

  // Build SpecQuery directly from columns
  const coreJoinQuery: SpecQuery<
    PColumn<TreeNodeAccessor | PColumnValues | DataInfo<TreeNodeAccessor>>
  > = {
    type: params.coreJoinType === "inner" ? "innerJoin" : "fullJoin",
    entries: coreColumns.map((c) => joinEntry({ type: "column", column: c })),
  };

  let query: SpecQuery<PColumn<TreeNodeAccessor | PColumnValues | DataInfo<TreeNodeAccessor>>> = {
    type: "outerJoin",
    primary: joinEntry(coreJoinQuery),
    secondary: secondaryColumns.map((c) => joinEntry({ type: "column", column: c })),
  };

  // Apply filters
  if (params.filters !== null) {
    const nonEmpty = distillFilterSpec(params.filters);

    if (!isNil(nonEmpty)) {
      const pridicate = filterSpecToSpecQueryExpr(nonEmpty);
      if (!isBooleanExpression(pridicate)) {
        throw new Error(
          `Filter conversion produced a non-boolean expression (got type "${pridicate.type}"), expected a boolean predicate for query filtering`,
        );
      }
      query = {
        type: "filter",
        input: query,
        predicate: pridicate,
      };
    }
  }

  // Apply sorting
  if (params.sorting.length > 0) {
    query = {
      type: "sort",
      input: query,
      sortBy: params.sorting.map((s) => ({
        expression: columnIdToExpr(s.column),
        ascending: s.ascending,
        nullsFirst: !s.naAndAbsentAreLeastValues,
      })),
    };
  }

  return { query };
}

/** Check if column should be omitted from the table */
export function isColumnHidden(spec: { annotations?: Annotation }): boolean {
  return readAnnotation(spec, Annotation.Table.Visibility) === "hidden";
}

/** Check if column is hidden by default */
export function isColumnOptional(spec: { annotations?: Annotation }): boolean {
  return readAnnotation(spec, Annotation.Table.Visibility) === "optional";
}

/** Structured source config — selectors/anchors instead of raw ColumnSource. */
type ColumnsSelectorConfig = {
  include?: ColumnSelector | ColumnSelector[];
  exclude?: ColumnSelector | ColumnSelector[];
  anchors?: Record<string, PlRef | PObjectId | PColumnSpec>;
  mode?: MatchingMode;
  maxLinkerHops?: number;
};

export type createPlDataTableOptionsV3 = {
  source?: ColumnSource | ColumnSource[];
  columns: ColumnsSelectorConfig;

  // Existing from V2
  filters?: PlDataTableFilters;
  sorting?: PTableSorting[];
  coreJoinType?: "inner" | "full";
  coreColumnPredicate?: (spec: PColumnIdAndSpec) => boolean;

  state?: PlDataTableStateV2;
};

// interface ColumnDisplayConfig {
//   /** Column ordering rules. Higher priority = further left. First matching rule wins. */
//   ordering?: ColumnOrderRule[];
//   /** Column visibility rules. First matching rule wins. Unmatched columns use default visibility. */
//   visibility?: ColumnVisibilityRule[];
// }

// interface ColumnOrderRule {
//   match: ColumnMatcher;
//   /** Higher number = further left in table */
//   priority: number;
// }

// interface ColumnVisibilityRule {
//   match: ColumnMatcher;
//   visibility: "default" | "optional" | "hidden";
// }

// type ColumnMatcher =
//   | ((spec: PColumnSpec) => boolean)
//   | { name: string | string[] }
//   | { annotation: Record<string, string> }
//   | { ids: Set<string> };

export function createPlDataTableV3<A, U>(
  ctx: RenderCtxBase<A, U>,
  options: createPlDataTableOptionsV3,
): PlDataTableModel | undefined {
  const { source } = options;
  const providers = source
    ? normalizeSourceList(source).filter(isColumnProvider)
    : collectCtxColumnProviders(ctx);

  if (providers.length === 0) return undefined;

  // Step 1: Build collection from sources
  const builder = new ColumnCollectionBuilder().addSources(providers);
  const anchors = options.columns.anchors;
  const collection = isNil(anchors) ? builder.build() : builder.build({ anchors });

  if (!collection) return undefined;

  // Step 2: Get data columns, excluding annotation-hidden ones
  const findOptions = options.columns
    ? {
        include: options.columns.include,
        exclude: options.columns.exclude,
        mode: options.columns.mode,
        maxLinkerHops: options.columns.maxLinkerHops,
      }
    : undefined;
  const findResult = collection.findColumns(findOptions);
  const snapshots = findResult.map((v) => ("column" in v ? v.column : v));
  const dataSnapshots = snapshots.filter((s) => !isColumnHidden(s.spec));
  if (dataSnapshots.length === 0) return undefined;

  // Convert snapshots to PColumn<PColumnDataUniversal>[]
  const columns: PColumn<PColumnDataUniversal>[] = [];
  for (const snap of dataSnapshots) {
    if (!snap.data) return undefined;
    const data = snap.data.get();
    if (data === undefined) return undefined;
    columns.push({ id: snap.id, spec: snap.spec, data });
  }

  // Step 3: Normalize table state
  const tableStateNormalized = upgradePlDataTableStateV2(options.state);

  // Step 4: Get label columns from result pool and match to data columns
  const allLabelColumns = getAllLabelColumns(ctx.resultPool);
  if (!allLabelColumns) return undefined;

  const fullLabelColumns = getMatchingLabelColumns(
    columns.map(getColumnIdAndSpec),
    allLabelColumns,
  );

  const fullColumns = [...columns, ...fullLabelColumns];

  // Step 5: Build column ID set for filter/sorting validation
  const fullColumnsAxes = uniqueBy(
    fullColumns.flatMap((c) => c.spec.axesSpec.map((a) => getAxisId(a))),
    (a) => canonicalizeJson<AxisId>(a),
  );
  const fullColumnsIds: PTableColumnId[] = [
    ...fullColumnsAxes.map((a) => ({ type: "axis", id: a }) satisfies PTableColumnIdAxis),
    ...fullColumns.map((c) => ({ type: "column", id: c.id }) satisfies PTableColumnIdColumn),
  ];
  const fullColumnsIdsSet = new Set(fullColumnsIds.map((c) => canonicalizeJson<PTableColumnId>(c)));
  const isValidColumnId = (id: string): boolean =>
    fullColumnsIdsSet.has(id as CanonicalizedJson<PTableColumnId>);

  // Step 6: Filtering validation
  const stateFilters = tableStateNormalized.pTableParams.filters;
  const opsFilters = options?.filters ?? null;
  const filters: null | PlDataTableFilters =
    stateFilters != null && opsFilters != null
      ? { type: "and", filters: [stateFilters, opsFilters] }
      : (stateFilters ?? opsFilters);
  const filterColumns = filters ? collectFilterSpecColumns(filters) : [];
  const firstInvalidFilterColumn = filterColumns.find((col) => !isValidColumnId(col));
  if (firstInvalidFilterColumn)
    throw new Error(
      `Invalid filter column ${firstInvalidFilterColumn}: column reference does not match the table columns`,
    );

  // Step 7: Sorting validation
  const userSorting = tableStateNormalized.pTableParams.sorting;
  const sorting = (isEmpty(userSorting) ? options?.sorting : userSorting) ?? [];
  const firstInvalidSortingColumn = sorting.find(
    (s) => !isValidColumnId(canonicalizeJson<PTableColumnId>(s.column)),
  );
  if (firstInvalidSortingColumn)
    throw new Error(
      `Invalid sorting column ${JSON.stringify(firstInvalidSortingColumn.column)}: column reference does not match the table columns`,
    );

  // Step 8: Build full table definition and handles
  const coreJoinType = options?.coreJoinType ?? "full";
  const fullDef = createPTableDef({
    columns,
    labelColumns: fullLabelColumns,
    coreJoinType,
    filters,
    sorting,
    coreColumnPredicate: options?.coreColumnPredicate,
  });

  const fullHandle = ctx.createPTableV2(fullDef);
  const pframeHandle = ctx.createPFrame(fullColumns);
  if (!fullHandle || !pframeHandle) return undefined;

  // Step 9: Determine hidden columns
  const hiddenColumns = new Set<PObjectId>(
    ((): PObjectId[] => {
      // Inner join works as a filter — all columns must be present
      if (coreJoinType === "inner") return [];

      const hiddenColIds = tableStateNormalized.pTableParams.hiddenColIds;
      if (hiddenColIds) return hiddenColIds;

      return columns.filter((c) => isColumnOptional(c.spec)).map((c) => c.id);
    })(),
  );

  // Preserve linker columns
  columns.filter((c) => isLinkerColumn(c.spec)).forEach((c) => hiddenColumns.delete(c.id));

  // Preserve core columns as they change the shape of join
  const coreColumnPredicate = options?.coreColumnPredicate;
  if (coreColumnPredicate) {
    const coreColumns = columns.flatMap((c) =>
      coreColumnPredicate(getColumnIdAndSpec(c)) ? [c.id] : [],
    );
    coreColumns.forEach((c) => hiddenColumns.delete(c));
  }

  // Preserve sorted columns from being hidden
  sorting
    .map((s) => s.column)
    .filter((c): c is PTableColumnIdColumn => c.type === "column")
    .forEach((c) => hiddenColumns.delete(c.id));

  // Preserve filter columns from being hidden
  if (filters) {
    collectFilterSpecColumns(filters)
      .flatMap((c) => {
        const obj = parseJson(c);
        return obj.type === "column" ? [obj.id] : [];
      })
      .forEach((c) => hiddenColumns.delete(c));
  }

  // Step 10: Build visible table definition
  const visibleColumns = columns.filter((c) => !hiddenColumns.has(c.id));
  const visibleLabelColumns = getMatchingLabelColumns(
    visibleColumns.map(getColumnIdAndSpec),
    allLabelColumns,
  );

  if (!allPColumnsReady([...visibleColumns, ...visibleLabelColumns])) return undefined;

  const visibleDef = createPTableDef({
    columns: visibleColumns,
    labelColumns: visibleLabelColumns,
    coreJoinType,
    filters,
    sorting,
    coreColumnPredicate,
  });
  const visibleHandle = ctx.createPTableV2(visibleDef);

  if (!visibleHandle) return undefined;

  return {
    sourceId: tableStateNormalized.pTableParams.sourceId,
    fullTableHandle: fullHandle,
    fullPframeHandle: pframeHandle,
    visibleTableHandle: visibleHandle,
  } satisfies PlDataTableModel;
}

/** Normalize raw ColumnSource | ColumnSource[] into a flat list of sources. */
function normalizeSourceList(source: ColumnSource | ColumnSource[]): ColumnSource[] {
  if (
    Array.isArray(source) &&
    source.length > 0 &&
    (Array.isArray(source[0]) || isColumnProvider(source[0]))
  ) {
    return source as ColumnSource[];
  }
  return [source as ColumnSource];
}
