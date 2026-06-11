import type { PTableShape, PTableVector, TableRange } from "@milaboratories/pl-model-common";

/**
 * Table view returned by `createTable`.
 *
 * Self-contained: does not extend any earlier per-table interface. Once this
 * version is adopted, every earlier `PTableV*` interface is dropped, so this
 * declaration repeats the full method surface rather than referencing the
 * predecessors.
 *
 * {@link PTableV12.export} takes an `ops.headers` list of
 * `[unified column index, header name]` pairs that both selects the columns
 * to export and names them.
 *
 * PTable can be thought as having a composite primary key, consisting
 * of axes, and a set of data columns derived from PColumn values.
 * The table's column spec is owned by the caller — selector → index
 * resolution runs on the caller side via WASM-spec.
 */
export interface PTableV12 extends Disposable {
  /**
   * Get PTable disk footprint in bytes.
   *
   * @param ops.withPredecessors When true, the footprint includes
   *   every registered predecessor table reachable through the
   *   query lineage. When false or omitted, only this table's own
   *   materialised data is counted.
   *
   * Warning: This call materializes the join.
   */
  getFootprint(ops?: { withPredecessors?: boolean; signal?: AbortSignal }): Promise<number>;

  /**
   * Unified table shape
   * Warning: This call materializes the join.
   */
  getShape(ops?: { signal?: AbortSignal }): Promise<PTableShape>;

  /**
   * Retrieve the data from the table. To retrieve only data required, it can be
   * sliced both horizontally ({@link columnIndices}) and vertically
   * ({@link range}).
   * This call materializes the join.
   *
   * @param columnIndices unified indices of columns to be retrieved
   * @param range optionally limit the range of records to retrieve
   * */
  getData(
    columnIndices: number[],
    ops?: {
      range?: TableRange;
      signal?: AbortSignal;
    },
  ): Promise<PTableVector[]>;

  /**
   * Stream the sorted table to a file at `path`. The output format is
   * selected from the file extension: `csv`, `tsv`, `parquet`, or `xlsx`.
   * Writing is bounded-memory.
   * This call materializes the join.
   *
   * @param path destination file path; its extension selects the format
   * @param ops.headers list of `[unified column index, header name]` pairs
   *   (unified index: axes first, then data columns). Only the columns listed
   *   are exported, in ascending index order — the list both selects the
   *   columns and names them (the data layer is name-independent, so names
   *   are supplied by the caller).
   *
   * @remarks For `xlsx` the caller must ensure the row count is below Excel's
   *   1,048,576-row per-sheet limit.
   */
  export(
    path: string,
    ops?: {
      headers: [number, string][];
      signal?: AbortSignal;
    },
  ): Promise<void>;

  /** Deallocates all underlying resources */
  dispose(): void;
}
