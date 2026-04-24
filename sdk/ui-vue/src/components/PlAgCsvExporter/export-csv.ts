import { type ColDef, type ColGroupDef, type GridApi } from "ag-grid-enterprise";
import type {
  PTableHandle,
  PTableDownloadFormat,
  PTableColumnSpec,
  PTableColumnId,
  CanonicalizedJson,
  WritePTableToFsResult,
} from "@platforma-sdk/model";
import { canonicalizeJson, getPTableColumnId } from "@platforma-sdk/model";
import { isNil } from "es-toolkit";
import { Nil } from "@milaboratories/helpers";
import { getServices } from "../../internal/getServices";

/** Options for the native CSV export path. */
export interface ExportOptions {
  tableHandle: PTableHandle;
  format: PTableDownloadFormat;
  defaultFileName?: string;
}

/**
 * CSV export via the platforma desktop runtime. Prompts for a save
 * destination via the `Dialog` service, then streams the PTable to the
 * chosen path via `PFrame.writePTableToFs`.
 */
export async function exportCsv(
  gridApi: GridApi,
  nativeOptions: ExportOptions,
): Promise<undefined | WritePTableToFsResult> {
  const { dialog, pframe } = getServices();
  if (isNil(dialog)) {
    throw new Error("dialog service is not available in the current environment");
  }
  if (isNil(pframe)) {
    throw new Error("pframe service is not available");
  }

  const specs = await pframe.getSpec(nativeOptions.tableHandle);
  const columnIndices = collectVisibleColumnIndices(gridApi, specs);
  if (isNil(columnIndices)) {
    return undefined;
  }

  const format = nativeOptions.format;
  const { canceled, path } = await dialog.showSaveDialog({
    defaultFileName: nativeOptions.defaultFileName,
    filters: [{ name: format.toUpperCase(), extensions: [format] }],
  });
  if (canceled || isNil(path)) {
    return undefined;
  }

  return pframe.writePTableToFs(nativeOptions.tableHandle, {
    path,
    format,
    columnIndices,
  });
}

/**
 * Checks whether the native CSV export capability is available in the
 * current platforma runtime environment. Both `Dialog` and `PFrame`
 * services must be present — desktop-app wires them, web/preview do not.
 */
export function isCsvExportAvailable(): boolean {
  try {
    const services = getServices();
    return !isNil(services?.dialog) && !isNil(services?.pframe);
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
  // @todo: pframeSpec.findTableColumn;
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
