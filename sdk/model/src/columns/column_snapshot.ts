import type { PColumnSpec, PObjectId, SUniversalPColumnId } from "@milaboratories/pl-model-common";
import type { PColumnDataUniversal } from "../render/internal";

// --- ColumnSnapshot ---

/** Data status of a column snapshot. */
export type ColumnDataStatus = "ready" | "computing" | "absent";

/**
 * Immutable snapshot of a column: spec, data status, and lazy data accessor.
 *
 * - `dataStatus` is readable without marking the render context unstable.
 * - `data` holds an active object when data exists (ready or computing),
 *   or `undefined` when data is permanently absent.
 */
export interface ColumnSnapshot<Id extends PObjectId | SUniversalPColumnId> {
  readonly id: Id;
  readonly spec: PColumnSpec;
  readonly dataStatus: ColumnDataStatus;

  /**
   * Lazy data accessor.
   * - `'ready'`: `data.get()` returns column data, context stays stable.
   * - `'computing'`: `data.get()` returns `undefined`, marks context unstable.
   * - `'absent'`: `data` is `undefined` — no active object, no instability.
   */
  readonly data: ColumnData | undefined;
}

// --- ColumnData ---

/**
 * Active object wrapping lazy column data access.
 * Accessing data on a computing column marks the render context unstable.
 */
export interface ColumnData {
  get(): PColumnDataUniversal | undefined;
}

/** Creates a ColumnData active object for a ready column. */
export function createReadyColumnData(getData: () => PColumnDataUniversal | undefined): ColumnData {
  return { get: getData };
}

// --- Snapshot construction helpers ---

/** Creates a ColumnSnapshot from parts. */
export function createColumnSnapshot<Id extends PObjectId>(
  id: Id,
  spec: PColumnSpec,
  dataStatus: ColumnDataStatus,
  data: ColumnData | undefined,
): ColumnSnapshot<Id> {
  return { id, spec, dataStatus, data };
}
