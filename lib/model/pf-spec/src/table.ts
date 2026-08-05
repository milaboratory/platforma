import type { PTableColumnId, PTableColumnSpec } from "@milaboratories/pl-model-common";
import { spec as bindings } from "./generated/pframes_rs_wasip2.js";

export function findColumn(tableSpec: PTableColumnSpec[], selector: PTableColumnId): number {
  using table = bindings.Table.fromJson(JSON.stringify(tableSpec));
  try {
    return JSON.parse(table.findColumn(JSON.stringify(selector)));
  } catch {
    return -1;
  }
}
