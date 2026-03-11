import type {
  PColumn,
  PColumnSelector,
  PColumnSpec,
  PObjectId,
} from "@milaboratories/pl-model-common";
import { selectorsToPredicate } from "@milaboratories/pl-model-common";
import { TreeNodeAccessor } from "../render/accessor";
import type { PColumnDataUniversal } from "../render/internal";
import type { ColumnDataStatus, ColumnSnapshot } from "./column_snapshot";

// --- ColumnProvider ---

/**
 * Data source interface for column enumeration.
 *
 * Knows nothing about the render framework, stability tracking, labels,
 * anchoring, or splitting. All that complexity lives in the collection layer.
 */
export interface ColumnProvider {
  /** Returns currently known columns matching the selectors. */
  selectColumns(
    selectors: ((spec: PColumnSpec) => boolean) | PColumnSelector | PColumnSelector[],
  ): ColumnSnapshot[];

  /** Direct lookup by provider-native ID.
   *  Used for anchor resolution at build time. */
  getColumn(id: PObjectId): undefined | ColumnSnapshot;

  /** Whether the provider has finished enumerating all its columns.
   *  Calling this may mark the render context unstable — it touches
   *  the reactive tree to check field resolution state. */
  isColumnListComplete(): boolean;
}

// --- ColumnSource ---

/**
 * Union of types that can serve as column sources for helpers and builders.
 * Does NOT include TreeNodeAccessor — call `.toColumnSource()` on it first.
 */
export type ColumnSource =
  | ColumnProvider
  | ColumnSnapshot[]
  | PColumn<PColumnDataUniversal | undefined>[];

// --- ArrayColumnProvider ---

/**
 * Simple provider wrapping an array of PColumns.
 * Always complete, data status always 'ready'.
 */
export class ArrayColumnProvider implements ColumnProvider {
  private readonly columns: ColumnSnapshot[];

  constructor(columns: PColumn<PColumnDataUniversal | undefined>[]) {
    this.columns = columns.map((col) => ({
      id: col.id,
      spec: col.spec,
      dataStatus: "ready" as const,
      data: { get: () => col.data },
    }));
  }

  selectColumns(
    selectors: ((spec: PColumnSpec) => boolean) | PColumnSelector | PColumnSelector[],
  ): ColumnSnapshot[] {
    const predicate = typeof selectors === "function" ? selectors : selectorsToPredicate(selectors);
    return this.columns.filter((col) => predicate(col.spec));
  }

  getColumn(id: PObjectId): undefined | ColumnSnapshot {
    return this.columns.find((col) => col.id === id);
  }

  isColumnListComplete(): boolean {
    return true;
  }
}

// --- SnapshotColumnProvider ---

/**
 * Provider wrapping an array of ColumnSnapshots.
 * Always complete. Data status taken from each snapshot.
 */
export class SnapshotColumnProvider implements ColumnProvider {
  private readonly columns: ColumnSnapshot[];

  constructor(snapshots: ColumnSnapshot[]) {
    this.columns = snapshots.map((snap) => ({
      id: snap.id,
      spec: snap.spec,
      dataStatus: snap.dataStatus,
      data: { get: () => snap.data?.get() },
    }));
  }

  selectColumns(
    selectors: ((spec: PColumnSpec) => boolean) | PColumnSelector | PColumnSelector[],
  ): ColumnSnapshot[] {
    const predicate = typeof selectors === "function" ? selectors : selectorsToPredicate(selectors);
    return this.columns.filter((col) => predicate(col.spec));
  }

  getColumn(id: PObjectId): undefined | ColumnSnapshot {
    return this.columns.find((col) => col.id === id);
  }

  isColumnListComplete(): boolean {
    return true;
  }
}

// --- OutputColumnProvider ---

export interface OutputColumnProviderOpts {
  /** When true and the accessor is final, columns with no ready data get status 'absent'. */
  allowPermanentAbsence?: boolean;
}

/**
 * Provider wrapping a TreeNodeAccessor (output/prerun resolve result).
 * Detects data status from accessor readiness state.
 */
export class OutputColumnProvider implements ColumnProvider {
  constructor(
    private readonly accessor: TreeNodeAccessor,
    private readonly opts?: OutputColumnProviderOpts,
  ) {}

  selectColumns(
    selectors: ((spec: PColumnSpec) => boolean) | PColumnSelector | PColumnSelector[],
  ): ColumnSnapshot[] {
    const predicate = typeof selectors === "function" ? selectors : selectorsToPredicate(selectors);
    return this.getColumns().filter((col) => predicate(col.spec));
  }

  getColumn(id: PObjectId): undefined | ColumnSnapshot {
    return this.getColumns().find((col) => col.id === id);
  }

  isColumnListComplete(): boolean {
    return this.accessor.getInputsLocked();
  }

  private getColumns(): ColumnSnapshot[] {
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

/**
 * Create a ColumnProvider from a TreeNodeAccessor (output/prerun resolve result).
 */
export function createOutputColumnProvider(
  accessor: TreeNodeAccessor,
  opts?: OutputColumnProviderOpts,
): ColumnProvider {
  return new OutputColumnProvider(accessor, opts);
}

// --- Source normalization ---

/** Checks if a value is a ColumnProvider (duck-typing). */
export function isColumnProvider(source: unknown): source is ColumnProvider {
  return (
    typeof source === "object" &&
    source !== null &&
    "selectColumns" in source &&
    "getColumn" in source &&
    "isColumnListComplete" in source &&
    typeof (source as ColumnProvider).selectColumns === "function" &&
    typeof (source as ColumnProvider).getColumn === "function" &&
    typeof (source as ColumnProvider).isColumnListComplete === "function"
  );
}

/** Checks if a value looks like a PColumn (has id, spec, data). */
function isPColumnArray(
  source: ColumnSource,
): source is PColumn<PColumnDataUniversal | undefined>[] {
  if (!Array.isArray(source)) return false;
  if (source.length === 0) return true; // empty array — treat as PColumn[]
  const first = source[0];
  return "id" in first && "spec" in first && "data" in first && !("dataStatus" in first);
}

/** Checks if a value looks like a ColumnSnapshot array. */
function isSnapshotArray(source: ColumnSource): source is ColumnSnapshot[] {
  if (!Array.isArray(source)) return false;
  if (source.length === 0) return true; // empty array — treat as snapshots
  const first = source[0];
  return "id" in first && "spec" in first && "dataStatus" in first;
}

/**
 * Normalize any ColumnSource into a ColumnProvider.
 * - ColumnProvider → returned as-is
 * - ColumnSnapshot[] → wrapped in SnapshotColumnProvider
 * - PColumn[] → wrapped in ArrayColumnProvider
 */
export function toColumnProvider(source: ColumnSource): ColumnProvider {
  if (isColumnProvider(source)) return source;
  if (isSnapshotArray(source)) return new SnapshotColumnProvider(source);
  if (isPColumnArray(source)) return new ArrayColumnProvider(source);
  // Should not reach here given the type union, but be safe
  throw new Error("Unknown ColumnSource type");
}
