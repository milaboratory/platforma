import type {
  PColumn,
  PColumnIdAndSpec,
  PTableSorting,
  PTableDefV2,
  DataInfo,
  PColumnValues,
} from "@milaboratories/pl-model-common";
import { getColumnIdAndSpec } from "@milaboratories/pl-model-common";
import type { PColumnDataUniversal, TreeNodeAccessor } from "../../../render";
import { isFunction } from "es-toolkit";
import type { PlDataTableFilters } from "../typesV5";
import { createPTableDefV3 } from "./createPTableDefV3";

export function createPTableDefV2(params: {
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

  return createPTableDefV3({
    coreColumns,
    secondaryGroups: secondaryColumns.map((c) => [c]),
    coreJoinType: params.coreJoinType,
    filters: params.filters,
    sorting: params.sorting,
  });
}
