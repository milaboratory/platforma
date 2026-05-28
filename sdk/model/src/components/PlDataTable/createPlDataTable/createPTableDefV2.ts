import type {
  ColumnUniversalId,
  PColumn,
  PColumnIdAndSpec,
  PTableSorting,
  PTableDefV2,
} from "@milaboratories/pl-model-common";
import { getColumnIdAndSpec } from "@milaboratories/pl-model-common";
import type { PColumnDataUniversal } from "../../../render";
import { isFunction } from "es-toolkit";
import type { PlDataTableFilters } from "../typesV8";
import { createPTableDefV3 } from "./createPTableDefV3";
import { ColumnLazyImpl } from "../../../columns";

export function createPTableDefV2(params: {
  columns: PColumn<undefined | PColumnDataUniversal>[];
  labelColumns: PColumn<undefined | PColumnDataUniversal>[];
  coreJoinType: "inner" | "full";
  filters: null | PlDataTableFilters;
  sorting: PTableSorting[];
  coreColumnPredicate?: (spec: PColumnIdAndSpec) => boolean;
}): PTableDefV2<ColumnUniversalId> {
  let coreColumns = params.columns;
  const secondaryColumns: typeof params.columns = [];

  if (isFunction(params.coreColumnPredicate)) {
    coreColumns = [];
    for (const c of params.columns)
      if (params.coreColumnPredicate(getColumnIdAndSpec(c))) coreColumns.push(c);
      else secondaryColumns.push(c);
  }

  secondaryColumns.push(...params.labelColumns);

  return createPTableDefV3({
    primary: coreColumns.map((column) => ColumnLazyImpl.fromColumn(column)),
    secondary: secondaryColumns.map((column) => ColumnLazyImpl.fromColumn(column)),
    primaryJoinType: params.coreJoinType,
    filters: params.filters,
    sorting: params.sorting,
  });
}
