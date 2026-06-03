import type { PTableShape, PTableVector, TableRange } from "@milaboratories/pl-model-common";

/**
 * Table view returned by `createTable`.
 *
 * PTable can be thought as having a composite primary key, consisting
 * of axes, and a set of data columns derived from PColumn values.
 * The table's column spec is owned by the caller — selector → index
 * resolution runs on the caller side via WASM-spec.
 */
export interface PTableV10 extends Disposable {
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
   * Stream the full, sorted table to a file at `path`. The output format is
   * selected from the file extension: `csv`, `tsv`, `parquet`, or `xlsx`.
   * Writing is bounded-memory.
   * This call materializes the join.
   *
   * @param path destination file path; its extension selects the format
   * @param headers column names in unified order (axes first, then data
   *   columns). Length must equal the number of table fields — the data layer
   *   is name-independent, so names are supplied by the caller.
   *
   * @remarks For `xlsx` the caller must ensure the row count is below Excel's
   *   1,048,576-row per-sheet limit.
   */
  export(
    path: string,
    headers: string[],
    ops?: {
      signal?: AbortSignal;
    },
  ): Promise<void>;

  /** Deallocates all underlying resources */
  dispose(): void;
}

/**
 * Table view returned by `createTable`.
 *
 * Identical to {@link PTableV10} but {@link PTableV11.export} takes a
 * `headers` map (unified column index → header name) that both selects the
 * columns to export and names them, instead of a positional `string[]`.
 *
 * PTable can be thought as having a composite primary key, consisting
 * of axes, and a set of data columns derived from PColumn values.
 * The table's column spec is owned by the caller — selector → index
 * resolution runs on the caller side via WASM-spec.
 */
export interface PTableV11 extends Disposable {
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
   * @param headers map from unified column index (axes first, then data
   *   columns) to the header name to use for that column. Only the columns
   *   present as keys are exported, in ascending index order — the map both
   *   selects the columns and names them (the data layer is name-independent,
   *   so names are supplied by the caller).
   *
   * @remarks For `xlsx` the caller must ensure the row count is below Excel's
   *   1,048,576-row per-sheet limit.
   */
  export(
    path: string,
    headers: Record<number, string>,
    ops?: {
      signal?: AbortSignal;
    },
  ): Promise<void>;

  /** Deallocates all underlying resources */
  dispose(): void;
}
