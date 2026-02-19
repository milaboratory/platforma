import type {
  AxisId,
  AxisSpec,
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
  CanonicalizedJson,
} from "@milaboratories/pl-model-common";
import {
  Annotation,
  canonicalizeJson,
  getAxisId,
  getColumnIdAndSpec,
  isLinkerColumn,
  readAnnotation,
  uniqueBy,
  isBooleanExpression,
  parseJson,
} from "@milaboratories/pl-model-common";
import { filterSpecToSpecQueryExpr } from "../../filters";
import type { RenderCtxBase, TreeNodeAccessor, PColumnDataUniversal } from "../../render";
import { allPColumnsReady, deriveLabels } from "../../render";
import { identity, isFunction, isNil } from "es-toolkit";
import { distillFilterSpec } from "../../filters/distill";
import type { CreatePlDataTableOps, PlDataTableFilters, PlDataTableModel } from "./v5";
import { upgradePlDataTableStateV2 } from "./state-migration";
import type { PlDataTableStateV2 } from "./state-migration";
import type { PlDataTableSheet } from "./v5";
import { getAllLabelColumns, getMatchingLabelColumns } from "./labels";
import { collectFilterSpecColumns } from "../../filters/traverse";

/** Convert a PTableColumnId to a SpecQueryExpression reference. */
function columnIdToExpr(col: PTableColumnId): SpecQueryExpression {
  if (col.type === "axis") {
    return { type: "axisRef", value: col.id as SingleAxisSelector };
  }
  return { type: "columnRef", value: col.id };
}

/** Wrap a SpecQuery as a SpecQueryJoinEntry with empty qualifications. */
function joinEntry<C>(input: SpecQuery<C>): SpecQueryJoinEntry<C> {
  return { entry: input, qualifications: [] };
}

function createPTableDef(params: {
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
        nullsFirst: s.ascending === s.naAndAbsentAreLeastValues,
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

/**
 * Create p-table spec and handle given ui table state
 *
 * @param ctx context
 * @param columns column list
 * @param tableState table ui state
 * @returns PlAgDataTableV2 table source
 */
export function createPlDataTableV2<A, U>(
  ctx: RenderCtxBase<A, U>,
  columns: PColumn<PColumnDataUniversal>[],
  tableState: PlDataTableStateV2 | undefined,
  ops?: CreatePlDataTableOps,
): PlDataTableModel | undefined {
  if (columns.length === 0) return undefined;

  const tableStateNormalized = upgradePlDataTableStateV2(tableState);

  const allLabelColumns = getAllLabelColumns(ctx.resultPool);
  if (!allLabelColumns) return undefined;

  let fullLabelColumns = getMatchingLabelColumns(columns.map(getColumnIdAndSpec), allLabelColumns);
  fullLabelColumns = deriveLabels(fullLabelColumns, identity, { includeNativeLabel: true }).map(
    (v) => {
      return {
        ...v.value,
        spec: {
          ...v.value.spec,
          annotations: {
            ...v.value.spec.annotations,
            [Annotation.Label]: v.label,
          },
        },
      };
    },
  );

  const fullColumns = [...columns, ...fullLabelColumns];

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

  // -- Filtering validation --
  const stateFilters = tableStateNormalized.pTableParams.filters;
  const opsFilters = ops?.filters ?? null;
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

  // -- Sorting validation --
  const sorting: PTableSorting[] = uniqueBy(
    [...tableStateNormalized.pTableParams.sorting, ...(ops?.sorting ?? [])],
    (s) => canonicalizeJson<PTableColumnId>(s.column),
  );
  const firstInvalidSortingColumn = sorting.find(
    (s) => !isValidColumnId(canonicalizeJson<PTableColumnId>(s.column)),
  );
  if (firstInvalidSortingColumn)
    throw new Error(
      `Invalid sorting column ${JSON.stringify(firstInvalidSortingColumn.column)}: column reference does not match the table columns`,
    );

  const coreJoinType = ops?.coreJoinType ?? "full";
  const fullDef = createPTableDef({
    columns,
    labelColumns: fullLabelColumns,
    coreJoinType,
    filters,
    sorting,
    coreColumnPredicate: ops?.coreColumnPredicate,
  });

  const fullHandle = ctx.createPTableV2(fullDef);
  if (!fullHandle) return undefined;

  const hiddenColumns = new Set<PObjectId>(
    ((): PObjectId[] => {
      // Inner join works as a filter - all columns must be present
      if (coreJoinType === "inner") return [];

      const hiddenColIds = tableStateNormalized.pTableParams.hiddenColIds;
      if (hiddenColIds) return hiddenColIds;

      return columns.filter((c) => isColumnOptional(c.spec)).map((c) => c.id);
    })(),
  );

  // Preserve linker columns
  columns.filter((c) => isLinkerColumn(c.spec)).forEach((c) => hiddenColumns.delete(c.id));

  // Preserve core columns as they change the shape of join.
  const coreColumnPredicate = ops?.coreColumnPredicate;
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

  const visibleColumns = columns.filter((c) => !hiddenColumns.has(c.id));
  const visibleLabelColumns = getMatchingLabelColumns(
    visibleColumns.map(getColumnIdAndSpec),
    allLabelColumns,
  );

  // if at least one column is not yet computed, we can't show the table
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
    visibleTableHandle: visibleHandle,
    hiddenColumns: [...hiddenColumns],
    collectFilterSpecColumns: filters && collectFilterSpecColumns(filters),
  } as PlDataTableModel;
}

/** Create sheet entries for PlDataTable */
export function createPlDataTableSheet<A, U>(
  ctx: RenderCtxBase<A, U>,
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
