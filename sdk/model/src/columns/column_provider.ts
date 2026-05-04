import type { PColumn } from "@milaboratories/pl-model-common";
import { TreeNodeAccessor } from "../render/accessor";
import type { PColumnDataUniversal } from "../render/internal";

/**
 * Data source interface for column enumeration.
 *
 * Knows nothing about the render framework, stability tracking, labels,
 * anchoring, or splitting. All that complexity lives in the collection layer.
 */
export interface ColumnProvider {
  /** Returns all currently known columns. */
  getAllColumns(): PColumn<PColumnDataUniversal | undefined>[];

  /** Whether the provider has finished enumerating all its columns.
   *  Calling this may mark the render context unstable — it touches
   *  the reactive tree to check field resolution state. */
  isColumnListComplete(): boolean;
}

/**
 * Union of types that can serve as column sources for helpers and builders.
 * Does NOT include TreeNodeAccessor — call `.toColumnSource()` on it first.
 */
export type ColumnSource = ColumnProvider | PColumn<PColumnDataUniversal | undefined>[];

/**
 * Simple provider wrapping an array of PColumns.
 * Always complete; data status taken from each PColumn.
 */
export class ArrayColumnProvider implements ColumnProvider {
  constructor(private readonly columns: PColumn<PColumnDataUniversal | undefined>[]) {}

  getAllColumns(): PColumn<PColumnDataUniversal | undefined>[] {
    return this.columns;
  }

  isColumnListComplete(): boolean {
    return true;
  }
}

/**
 * Provider wrapping a TreeNodeAccessor (output/prerun resolve result).
 * Status of each column is derived inside the render ctx — see
 * `TreeNodeAccessor.getPColumns`.
 */
export class OutputColumnProvider implements ColumnProvider {
  constructor(private readonly accessor: TreeNodeAccessor) {}

  getAllColumns(): PColumn<PColumnDataUniversal | undefined>[] {
    return this.accessor.getPColumns() ?? [];
  }

  isColumnListComplete(): boolean {
    return this.accessor.getInputsLocked();
  }
}

/** Checks if a value is a ColumnProvider (duck-typing). */
export function isColumnProvider(source: unknown): source is ColumnProvider {
  return (
    typeof source === "object" &&
    source !== null &&
    "getAllColumns" in source &&
    "isColumnListComplete" in source &&
    typeof (source as ColumnProvider).getAllColumns === "function" &&
    typeof (source as ColumnProvider).isColumnListComplete === "function"
  );
}

/** Checks if a value looks like a PColumn array — has `id`, `spec`, `data`, `status`. */
function isPColumnArray(source: unknown): source is PColumn<PColumnDataUniversal | undefined>[] {
  if (!Array.isArray(source)) return false;
  if (source.length === 0) return true;
  const first = source[0];
  if (typeof first !== "object" || first === null) return false;
  return "id" in first && "spec" in first && "data" in first && "status" in first;
}

/**
 * Normalize any ColumnSource into a ColumnProvider.
 * - ColumnProvider → returned as-is
 * - PColumn[] → wrapped in ArrayColumnProvider
 */
export function toColumnProvider(source: ColumnSource): ColumnProvider {
  if (isColumnProvider(source)) return source;
  if (isPColumnArray(source)) return new ArrayColumnProvider(source);
  throw new Error("Unknown ColumnSource type");
}
