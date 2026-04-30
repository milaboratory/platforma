import type { PObjectId } from "@milaboratories/pl-model-common";
import { isDataInfo, PColumn, visitDataInfo } from "@milaboratories/pl-model-common";
import { TreeNodeAccessor } from "../render/accessor";
import type { PColumnDataUniversal } from "../render/internal";
import type { ColumnDataStatus, ColumnSnapshot } from "./column_snapshot";

/**
 * Data source interface for column enumeration.
 *
 * Knows nothing about the render framework, stability tracking, labels,
 * anchoring, or splitting. All that complexity lives in the collection layer.
 */
export interface ColumnSnapshotProvider {
  /** Returns all currently known columns. */
  getAllColumns(): ColumnSnapshot<PObjectId>[];

  /** Whether the provider has finished enumerating all its columns.
   *  Calling this may mark the render context unstable — it touches
   *  the reactive tree to check field resolution state. */
  isColumnListComplete(): boolean;
}

/**
 * Union of types that can serve as column sources for helpers and builders.
 * Does NOT include TreeNodeAccessor — call `.toColumnSource()` on it first.
 */
export type ColumnSource =
  | ColumnSnapshotProvider
  | ColumnSnapshot<PObjectId>[]
  | PColumn<PColumnDataUniversal | undefined>[];

/**
 * Simple provider wrapping an array of PColumns.
 * Always complete, data status always 'ready'.
 */
export class ArrayColumnProvider implements ColumnSnapshotProvider {
  private readonly columns: ColumnSnapshot<PObjectId>[];

  constructor(columns: PColumn<PColumnDataUniversal | undefined>[]) {
    this.columns = columns.map((col) => ({
      id: col.id,
      spec: col.spec,
      data: { get: () => col.data },
      dataStatus: this.getStatus(col.data),
    }));
  }

  getAllColumns(): ColumnSnapshot<PObjectId>[] {
    return this.columns;
  }

  isColumnListComplete(): boolean {
    return true;
  }

  protected getStatus(
    d: undefined | PColumnDataUniversal | (() => undefined | PColumnDataUniversal),
  ): ColumnDataStatus {
    if (d == null) {
      return "absent";
    }
    if (typeof d === "function") {
      return this.getStatus(d());
    }
    if (d instanceof TreeNodeAccessor) {
      if (d.getIsReadyOrError()) return "ready";
      if (d.getIsFinal()) return "absent";
      return "computing";
    }
    if (isDataInfo(d)) {
      let ready = true;
      let final = true;
      visitDataInfo(d, (v) => {
        ready &&= v.getIsReadyOrError();
        final &&= v.getIsFinal();
      });
      if (ready) return "ready";
      if (final) return "absent";
      return "computing";
    }
    return "ready";
  }
}

/**
 * Provider wrapping an array of ColumnSnapshots.
 * Always complete. Data status taken from each snapshot.
 */
export class SnapshotColumnProvider implements ColumnSnapshotProvider {
  constructor(private readonly snapshots: ColumnSnapshot<PObjectId>[]) {}

  getAllColumns(): ColumnSnapshot<PObjectId>[] {
    return this.snapshots;
  }

  isColumnListComplete(): boolean {
    return true;
  }
}

export interface OutputColumnProviderOpts {
  /** When true and the accessor is final, columns with no ready data get status 'absent'. */
  allowPermanentAbsence?: boolean;
}

/**
 * Provider wrapping a TreeNodeAccessor (output/prerun resolve result).
 * Detects data status from accessor readiness state.
 */
export class OutputColumnProvider implements ColumnSnapshotProvider {
  constructor(
    private readonly accessor: TreeNodeAccessor,
    private readonly opts?: OutputColumnProviderOpts,
  ) {}

  getAllColumns(): ColumnSnapshot<PObjectId>[] {
    return this.getColumns();
  }

  isColumnListComplete(): boolean {
    return this.accessor.getInputsLocked();
  }

  private getColumns(): ColumnSnapshot<PObjectId>[] {
    const pColumns = this.accessor.getPColumns();
    if (pColumns === undefined) return [];

    const isFinal = this.accessor.getIsFinal();
    const allowAbsence = this.opts?.allowPermanentAbsence === true;

    return pColumns.map((col) => {
      const dataAccessor = col.data;
      const isReady = dataAccessor.getIsReadyOrError();

      let dataStatus: ColumnDataStatus;
      if (isReady) {
        dataStatus = "ready";
      } else if (allowAbsence && isFinal) {
        dataStatus = "absent";
      } else {
        dataStatus = "computing";
      }

      return {
        id: col.id,
        spec: col.spec,
        dataStatus,
        data: { get: () => (isReady ? dataAccessor : undefined) },
      };
    });
  }
}

/** Checks if a value is a ColumnSnapshotProvider (duck-typing). */
export function isColumnSnapshotProvider(source: unknown): source is ColumnSnapshotProvider {
  return (
    typeof source === "object" &&
    source !== null &&
    "getAllColumns" in source &&
    "isColumnListComplete" in source &&
    typeof (source as ColumnSnapshotProvider).getAllColumns === "function" &&
    typeof (source as ColumnSnapshotProvider).isColumnListComplete === "function"
  );
}

/** Checks if a value looks like a PColumn (has id, spec, data). */
function isPColumnArray(source: unknown): source is PColumn<PColumnDataUniversal | undefined>[] {
  if (!Array.isArray(source)) return false;
  if (source.length === 0) return true; // empty array — treat as PColumn[]
  const first = source[0];
  return "id" in first && "spec" in first && "data" in first && !("dataStatus" in first);
}

/** Checks if a value looks like a ColumnSnapshot array. */
function isColumnSnapshotArray(source: unknown): source is ColumnSnapshot<PObjectId>[] {
  if (!Array.isArray(source)) return false;
  if (source.length === 0) return true; // empty array — treat as snapshots
  const first = source[0];
  return "id" in first && "spec" in first && "dataStatus" in first;
}

/**
 * Normalize any ColumnSource into a ColumnSnapshotProvider.
 * - ColumnSnapshotProvider → returned as-is
 * - ColumnSnapshot<PObjectId>[] → wrapped in SnapshotColumnProvider
 * - PColumn[] → wrapped in ArrayColumnProvider
 */
export function toColumnSnapshotProvider(source: ColumnSource): ColumnSnapshotProvider {
  if (isColumnSnapshotProvider(source)) return source;
  if (isColumnSnapshotArray(source)) return new SnapshotColumnProvider(source);
  if (isPColumnArray(source)) return new ArrayColumnProvider(source);
  // Should not reach here given the type union, but be safe
  throw new Error("Unknown ColumnSource type");
}
