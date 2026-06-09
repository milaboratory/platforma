import type {
  AxisId,
  PColumn,
  PColumnSpec,
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
  PColumnName,
} from "@milaboratories/pl-model-common";
import type {
  AxisLabelProvider,
  ColumnProvider,
  PColumnDataUniversal,
  RenderCtxBase,
} from "../../../render";
import { allPColumnsReady, deriveLabels, PColumnCollection } from "../../../render";
import { identity } from "es-toolkit";
import type { CreatePlDataTableOps, PlDataTableModel } from "../typesV7";
import { upgradePlDataTableStateV2 } from "../state-migration";
import type { PlDataTableStateV2 } from "../state-migration";
import { getMatchingLabelColumns } from "../labels";
import { collectFilterSpecColumns } from "../../../filters/traverse";
import { isEmpty } from "es-toolkit/compat";
import { createPTableDefV2 } from "./createPTableDefV2";
import { isColumnOptional, resolveColumnHidden } from "./utils";
import type { Nil } from "@milaboratories/helpers";

/**
 * @deprecated This function is deprecated and will be removed in future. Please migrate to createPlDataTable with v3 options for improved column discovery and display configuration. See createPlDataTableOptionsV3 for details on the new options format and migration guidance.
 */
export type createPlDataTableOptionsV2 = {
  columns: PColumn<PColumnDataUniversal>[];
  tableState?: PlDataTableStateV2;
  options?: CreatePlDataTableOps;
};

/**
 * Create p-table spec and handle given ui table state
 *
 * @deprecated This version of createPlDataTable is deprecated and will be removed in future. Please migrate to v3 by switching to the new options format and providing necessary information for column discovery and display configuration. See createPlDataTableOptionsV3 for details.
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
  const allLabelColumns = getAllLabelColumns(ctx.resultPool) ?? [];

  let fullLabelColumns = getMatchingLabelColumns(columns, allLabelColumns);
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
  const filters = tableStateNormalized.pTableParams.filters;
  const defaultFilters = options?.filters ?? undefined;
  const filterColumns = filters !== null ? collectFilterSpecColumns(filters) : [];
  const firstInvalidFilterColumn = filterColumns.find((col) => !isValidColumnId(col));
  if (firstInvalidFilterColumn)
    throw new Error(
      `Invalid filter column ${firstInvalidFilterColumn}: column reference does not match the table columns`,
    );
  const defaultFilterColumns =
    defaultFilters !== undefined ? collectFilterSpecColumns(defaultFilters) : [];
  const firstInvalidDefaultFilterColumn = defaultFilterColumns.find((col) => !isValidColumnId(col));
  if (firstInvalidDefaultFilterColumn)
    throw new Error(
      `Invalid default filter column ${firstInvalidDefaultFilterColumn}: column reference does not match the table columns`,
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
  const fullDef = createPTableDefV2({
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

  const hiddenColumns =
    // Inner join works as a filter - all columns must be present.
    coreJoinType === "inner"
      ? new Set<PObjectId>()
      : computeHiddenColumnsV2(
          columns,
          tableStateNormalized.pTableParams.hiddenColIds,
          tableStateNormalized.pTableParams.shownColIds,
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

  const visibleDef = createPTableDefV2({
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
    defaultFilters,
  } satisfies PlDataTableModel;
}

/**
 * Reconcile each column's block default visibility with the user's explicit show/hide
 * deviations into the set of columns to hide, via the shared {@link resolveColumnHidden}
 * — the same precedence the V3 model (`computeHiddenColumns`) and the UI (`makeColDef`)
 * use. This keeps the deprecated V2 path from misreading the stored deviation lists as an
 * absolute hidden set, which dropped block defaults once any visibility was customised.
 *
 * `forcedHidden` is false: V2 has never auto-hidden `visibility: "hidden"` columns, and
 * the UI filters them out of the grid upstream, so this preserves V2's behaviour and
 * matches `makeColDef`. The caller then force-keeps sorted, filtered, linker, and core
 * columns visible.
 *
 * Exported for unit testing.
 */
export function computeHiddenColumnsV2(
  columns: { readonly id: PObjectId; readonly spec: PColumnSpec }[],
  hiddenSpecs: Nil | PTableColumnId[],
  shownSpecs: Nil | PTableColumnId[],
): Set<PObjectId> {
  const userHidden = new Set(
    (hiddenSpecs ?? [])
      .filter((s): s is PTableColumnIdColumn => s.type === "column")
      .map((s) => s.id),
  );
  const userShown = new Set(
    (shownSpecs ?? [])
      .filter((s): s is PTableColumnIdColumn => s.type === "column")
      .map((s) => s.id),
  );
  return new Set(
    columns
      .filter((c) =>
        resolveColumnHidden({
          forcedHidden: false,
          optional: isColumnOptional(c.spec),
          userShown: userShown.has(c.id),
          userHidden: userHidden.has(c.id),
        }),
      )
      .map((c) => c.id),
  );
}

function getAllLabelColumns(
  resultPool: AxisLabelProvider & ColumnProvider,
): PColumn<PColumnDataUniversal>[] | undefined {
  return new PColumnCollection()
    .addAxisLabelProvider(resultPool)
    .addColumnProvider(resultPool)
    .getColumns(
      {
        name: PColumnName.Label,
        axes: [{}], // exactly one axis
      },
      { dontWaitAllData: true, overrideLabelAnnotation: false },
    );
}
