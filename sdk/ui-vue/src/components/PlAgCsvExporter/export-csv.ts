import { type ColDef, type ColGroupDef, type GridApi } from "ag-grid-enterprise";
import type {
  FileFilter,
  PTableHandle,
  PTableColumnSpec,
  PFrameSpecDriver,
  WritePTableToFsResult,
} from "@platforma-sdk/model";
import { getPTableColumnId, XLSX_MAX_ROWS_PER_SHEET } from "@platforma-sdk/model";
import { isNil } from "es-toolkit";
import { Nil } from "@milaboratories/helpers";
import { getServices } from "../../internal/getServices";
import { PlAgDataTableRowNumberColId } from "../PlAgDataTable";

/** Options for the native table export. */
export interface ExportOptions {
  tableHandle: PTableHandle;
  defaultFileName?: string;
}

/** Save-dialog file-type filters for the native `exportPTable` path. */
const NATIVE_EXPORT_FILTERS: FileFilter[] = [
  { name: "CSV", extensions: ["csv"] },
  { name: "TSV", extensions: ["tsv"] },
  { name: "Parquet", extensions: ["parquet"] },
  { name: "Excel", extensions: ["xlsx"] },
];

/**
 * Save-dialog file-type filters for the `writePTableToFs` fallback. csv/tsv
 * only, offered both plain and gzip-compressed — a trailing `.gz` in the
 * chosen path selects gzip compression.
 */
const FALLBACK_EXPORT_FILTERS: FileFilter[] = [
  { name: "CSV (gzip)", extensions: ["csv.gz"] },
  { name: "CSV", extensions: ["csv"] },
  { name: "TSV (gzip)", extensions: ["tsv.gz"] },
  { name: "TSV", extensions: ["tsv"] },
];

/** Table format from a save path, ignoring a trailing `.gz`. e.g. `"t.csv.gz"` → `"csv"`. */
function tableFormatFromPath(path: string): string {
  const lower = path.toLowerCase();
  const base = lower.endsWith(".gz") ? lower.slice(0, -3) : lower;
  return base.slice(base.lastIndexOf(".") + 1);
}

/** True when `path` ends with one of the filters' extensions (e.g. `".csv"`). */
function matchesFilterExtension(path: string, filters: FileFilter[]): boolean {
  return filters.some(({ extensions }) => extensions.some((ext) => path.endsWith("." + ext)));
}

/**
 * Table export via the platforma desktop runtime. Prompts for a save
 * destination via the `Dialog` service — offering the available output formats
 * as file-type filters so the user picks the format — then writes the PTable to
 * the chosen path.
 *
 * Prefers the native `PFrame.exportPTable` when the runtime advertises it: the
 * table handle is the *visible* one, so exporting the whole handle reproduces
 * exactly the visible columns/rows, and the format (`csv`/`tsv`/`parquet`/
 * `xlsx`) is taken from the chosen file extension. Falls back to streaming the
 * visible columns via `PFrame.writePTableToFs` (`csv`/`tsv`, optionally
 * gzip-compressed when the chosen path ends in `.gz`) on runtimes that do not
 * advertise `exportPTable`.
 */
export async function exportCsv(
  gridApi: GridApi,
  nativeOptions: ExportOptions,
): Promise<undefined | WritePTableToFsResult> {
  const { dialog, pframe, pframeSpec } = getServices();
  if (isNil(dialog)) {
    throw new Error("dialog service is not available in the current environment");
  }
  if (isNil(pframe)) {
    throw new Error("pframe service is not available");
  }
  if (isNil(pframeSpec)) {
    throw new Error("pframeSpec service is not available");
  }

  const specs = await pframe.getSpec(nativeOptions.tableHandle);
  const columnIndices = collectVisibleColumnIndices(gridApi, specs, pframeSpec);
  if (isNil(columnIndices)) {
    return undefined;
  }

  const baseFileName = nativeOptions.defaultFileName ?? `table_${formatTimestamp(new Date())}`;

  if (typeof pframe.exportPTable === "function") {
    const { rows } = await pframe.getShape(nativeOptions.tableHandle);
    const filters =
      rows > XLSX_MAX_ROWS_PER_SHEET
        ? NATIVE_EXPORT_FILTERS.filter(({ name }) => name !== "Excel")
        : NATIVE_EXPORT_FILTERS;

    const { canceled, path } = await dialog.showSaveDialog({
      defaultFileName: `${baseFileName}.csv`,
      filters,
    });
    if (canceled || isNil(path) || !matchesFilterExtension(path, filters)) {
      return undefined;
    }

    await pframe.exportPTable(nativeOptions.tableHandle, { path, columnIndices });
    return undefined;
  }

  const { canceled, path } = await dialog.showSaveDialog({
    defaultFileName: `${baseFileName}.csv.gz`,
    filters: FALLBACK_EXPORT_FILTERS,
  });
  if (canceled || isNil(path) || !matchesFilterExtension(path, FALLBACK_EXPORT_FILTERS)) {
    return undefined;
  }

  const format = tableFormatFromPath(path);
  if (format !== "csv" && format !== "tsv") {
    return undefined;
  }

  return pframe.writePTableToFs(nativeOptions.tableHandle, {
    path,
    format,
    columnIndices,
    ...(path.toLowerCase().endsWith(".gz") && { compression: { type: "gzip" } }),
  });
}

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}` +
    `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
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
  pframeSpec: PFrameSpecDriver,
): Nil | number[] {
  const columnDefs = gridApi.getColumnDefs();
  if (isNil(columnDefs)) {
    return;
  }

  const findIndex = (spec: PTableColumnSpec) =>
    pframeSpec.findTableColumn(specs, getPTableColumnId(spec));

  const specsForDef = (def: ColDef | ColGroupDef): PTableColumnSpec[] => {
    if ("children" in def) return [];
    if (def.hide === true) return [];
    if (isNil(def.colId)) return [];
    if (def.colId === PlAgDataTableRowNumberColId) return [];
    return [def.context as PTableColumnSpec];
  };

  return [...new Set(columnDefs.flatMap(specsForDef).map(findIndex))].filter((idx) => idx !== -1);
}
