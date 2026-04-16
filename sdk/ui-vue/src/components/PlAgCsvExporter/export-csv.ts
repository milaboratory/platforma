import { type ColDef, type ColGroupDef, type GridApi } from "ag-grid-enterprise";
import type {
  PTableHandle,
  PTableDownloadFormat,
  PTableColumnSpec,
  PTableColumnId,
  CanonicalizedJson,
} from "@platforma-sdk/model";
import { canonicalizeJson, getPTableColumnId } from "@platforma-sdk/model";
import { isNil } from "es-toolkit";
import { Nil } from "@milaboratories/helpers";
import { getServices } from "../../internal/getServices";

/** Options for the native CSV export path. */
export interface ExportOptions {
  tableHandle: PTableHandle;
  format: PTableDownloadFormat;
}

/**
 * CSV export via the platforma desktop runtime.
 * Returns true if the native path was used, false if unavailable.
 */
export async function exportCsv(gridApi: GridApi, nativeOptions: ExportOptions): Promise<boolean> {
  const { pframe } = getServices();
  if (isNil(pframe)) {
    throw new Error("pframe service is not available");
  }

  const downloadPTable = pframe.downloadPTable;
  if (isNil(downloadPTable)) {
    return false;
  }

  const specs = await pframe.getSpec(nativeOptions.tableHandle);
  const columnIndices = collectVisibleColumnIndices(gridApi, specs);
  if (isNil(columnIndices)) {
    return false;
  }

  void downloadPTable.call(pframe, nativeOptions.tableHandle, {
    columnIndices,
    format: nativeOptions.format,
  });

  return true;
}

/**
 * Checks whether the native CSV export capability is available in the current
 * platforma runtime environment. Returns true only in the desktop app where
 * the preload wires `pframe.downloadPTable` to the save-dialog task.
 */
export function isCsvExportAvailable(): boolean {
  try {
    return !isNil(getServices()?.pframe?.downloadPTable);
  } catch {
    return false;
  }
}

/**
 * Collect unified column indices for visible (non-hidden) columns from the
 * ag-grid column defs, remapped onto the provided PTable spec array so the
 * indices match the current table handle (ColDef.field indices may be stale
 * or diverge from the spec order).
 */
export function collectVisibleColumnIndices(
  gridApi: GridApi,
  specs: PTableColumnSpec[],
): Nil | number[] {
  const columnDefs = gridApi.getColumnDefs();
  if (isNil(columnDefs)) {
    return;
  }

  const indexById = new Map<CanonicalizedJson<PTableColumnId>, number>(
    specs.map((spec, index) => [canonicalizeJson(getPTableColumnId(spec)), index] as const),
  );

  return columnDefs
    .filter(
      (def: ColDef | ColGroupDef): def is ColDef =>
        !("children" in def) && def.hide !== true && !isNil(def.context),
    )
    .map((def) =>
      indexById.get(canonicalizeJson(getPTableColumnId(def.context as PTableColumnSpec))),
    )
    .filter((index): index is number => !isNil(index));
}
