import type {
  ColumnUniversalId,
  FilterSpecNode,
  PColumn,
  PTableColumnIdColumn,
  PTableSorting,
} from "@milaboratories/pl-model-common";
import {
  Annotation,
  getColumnIdAndSpec,
  isLinkerColumn,
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
import type {
  CreatePlDataTableOps,
  PlDataTableFilters,
  PlDataTableFilterSpecLeaf,
  PlDataTableModel,
} from "../typesV8";
import { upgradePlDataTableStateV2 } from "../state-migration";
import type { PlDataTableStateV2 } from "../state-migration";
import { getMatchingLabelColumns } from "../labels";
import { collectFilterSpecColumns, traverseFilterSpec } from "../../../filters/traverse";
import { createPTableDefV2 } from "./createPTableDefV2";
import { isColumnOptional } from "./utils";
import { ColumnLazyImpl } from "../../../columns";
import { createColumnResolver, type ColumnResolver } from "../columnResolver";
import { isNil, type Nil } from "@milaboratories/helpers";

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

  const resolver = createColumnResolver(
    fullColumns.map((c) => ColumnLazyImpl.fromColumn(c)),
    { warn: ctx.logWarn.bind(ctx) },
  );

  // -- Filtering: rewrite via resolver, throw if any reference is unresolved --
  const rawFilters = tableStateNormalized.pTableParams.filters;
  const rawDefaultFilters = options?.filters ?? undefined;
  const filters = remapFiltersThrowing(rawFilters, resolver, "filter");
  const defaultFilters = remapFiltersThrowing(
    rawDefaultFilters ?? null,
    resolver,
    "default filter",
  );

  // -- Sorting: rewrite via resolver, throw if any reference is unresolved --
  const userSorting = tableStateNormalized.pTableParams.sorting;
  const rawSorting = (isNil(userSorting) ? options?.sorting : userSorting) ?? [];
  const sorting = remapSortingThrowing(rawSorting, resolver);

  const coreJoinType = options?.coreJoinType ?? "full";
  const fullDef = createPTableDefV2({
    columns,
    labelColumns: fullLabelColumns,
    coreJoinType,
    filters: filters ?? null,
    sorting,
    coreColumnPredicate: options?.coreColumnPredicate,
  });

  const fullHandle = ctx.createPTableV2(fullDef);
  const pframeHandle = ctx.createPFrame(fullColumns);
  if (!fullHandle || !pframeHandle) return undefined;

  const hiddenColumns = new Set<ColumnUniversalId>(
    ((): ColumnUniversalId[] => {
      // Inner join works as a filter - all columns must be present
      if (coreJoinType === "inner") return [];

      const hiddenColIds = tableStateNormalized.pTableParams.hiddenColIds;
      if (hiddenColIds !== null) {
        return hiddenColIds
          .filter((s): s is PTableColumnIdColumn => s.type === "column")
          .map((s) => s.id);
      }

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
      .flatMap((c) => (c.type === "column" ? [c.id] : []))
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
    filters: filters ?? null,
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
    defaultFilters: defaultFilters ?? undefined,
  } satisfies PlDataTableModel;
}

/** Rewrite filter column refs through the resolver; throw on any unresolved ref. */
function remapFiltersThrowing(
  filters: Nil | PlDataTableFilters,
  resolver: ColumnResolver,
  label: string,
): Nil | PlDataTableFilters {
  if (isNil(filters)) return filters;

  type Node = FilterSpecNode<PlDataTableFilterSpecLeaf>;
  return traverseFilterSpec(filters, {
    leaf: (leaf): Node => {
      if (leaf.type === undefined) return leaf;
      const result = { ...leaf };
      if ("column" in result) {
        const c = resolver(result.column);
        if (isNil(c))
          throw new Error(
            `Invalid ${label} column ${JSON.stringify(result.column)}: column reference does not match the table columns`,
          );
        result.column = c;
      }
      if ("rhs" in result) {
        const c = resolver(result.rhs);
        if (isNil(c))
          throw new Error(
            `Invalid ${label} column ${JSON.stringify(result.rhs)}: column reference does not match the table columns`,
          );
        result.rhs = c;
      }
      return result;
    },
    and: (results): Node => ({ type: "and", filters: results }),
    or: (results): Node => ({ type: "or", filters: results }),
    not: (result): Node => ({ type: "not", filter: result }),
  }) as PlDataTableFilters;
}

/** Rewrite sorting column refs through the resolver; throw on any unresolved ref. */
function remapSortingThrowing(sorting: PTableSorting[], resolver: ColumnResolver): PTableSorting[] {
  return sorting.map((s) => {
    const c = resolver(s.column);
    if (isNil(c))
      throw new Error(
        `Invalid sorting column ${JSON.stringify(s.column)}: column reference does not match the table columns`,
      );
    return { ...s, column: c };
  });
}

function getAllLabelColumns(
  resultPool: AxisLabelProvider & ColumnProvider,
): undefined | PColumn<undefined | PColumnDataUniversal>[] {
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
