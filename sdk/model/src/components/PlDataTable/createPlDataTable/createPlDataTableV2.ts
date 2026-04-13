import type {
  AxisId,
  PColumn,
  PObjectId,
  PTableColumnId,
  PTableColumnIdAxis,
  PTableColumnIdColumn,
  CanonicalizedJson,
} from "@milaboratories/pl-model-common";
import {
  Annotation,
  canonicalizeJson,
  getAxisId,
  getColumnIdAndSpec,
  isLinkerColumn,
  uniqueBy,
  parseJson,
} from "@milaboratories/pl-model-common";
import type { PColumnDataUniversal, RenderCtxBase } from "../../../render";
import { allPColumnsReady, deriveLabels } from "../../../render";
import { identity } from "es-toolkit";
import type { CreatePlDataTableOps, PlDataTableFilters, PlDataTableModel } from "../typesV5";
import { upgradePlDataTableStateV2 } from "../state-migration";
import type { PlDataTableStateV2 } from "../state-migration";
import { getAllLabelColumns, getMatchingLabelColumns } from "../labels";
import { collectFilterSpecColumns } from "../../../filters/traverse";
import { isEmpty } from "es-toolkit/compat";
import { createPTableDef, isColumnOptional } from "./createPlDataTableV3";

export type createPlDataTableOptionsV2 = {
  columns: PColumn<PColumnDataUniversal>[];
  tableState?: PlDataTableStateV2;
  options?: CreatePlDataTableOps;
};

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
  columns: createPlDataTableOptionsV2["columns"],
  tableState?: createPlDataTableOptionsV2["tableState"],
  options?: createPlDataTableOptionsV2["options"],
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

  // -- Sorting validation --
  const userSorting = tableStateNormalized.pTableParams.sorting;
  const sorting = (isEmpty(userSorting) ? options?.sorting : userSorting) ?? [];
  const firstInvalidSortingColumn = sorting.find(
    (s) => !isValidColumnId(canonicalizeJson<PTableColumnId>(s.column)),
  );
  if (firstInvalidSortingColumn)
    throw new Error(
      `Invalid sorting column ${JSON.stringify(firstInvalidSortingColumn.column)}: column reference does not match the table columns`,
    );

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
    fullPframeHandle: pframeHandle,
    visibleTableHandle: visibleHandle,
  } satisfies PlDataTableModel;
}
