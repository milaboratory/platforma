import type { CanonicalizedJson, PTableColumnSpec } from "@milaboratories/pl-model-common";

/**
 * v5 colId wrapper. v5 stored every grid colId as `{ source, labeled }` —
 * `source` was the original column spec, `labeled` was the spec with
 * labeled axes substituted by their label columns. v6 dropped the wrapper
 * and stores bare `PTableColumnSpec`. Kept here for the v5→v6 migration.
 */
export type PlDataTableV5ColIdWrapper = {
  source: PTableColumnSpec;
  labeled: PTableColumnSpec;
};

export type PlDataTableV5ColIdJson = CanonicalizedJson<PlDataTableV5ColIdWrapper>;

export type PlDataTableGridStateV5 = {
  columnOrder?: { orderedColIds: PlDataTableV5ColIdJson[] };
  sort?: { sortModel: { colId: PlDataTableV5ColIdJson; sort: "asc" | "desc" }[] };
  columnVisibility?: { hiddenColIds: PlDataTableV5ColIdJson[] };
};
