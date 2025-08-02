import type { DataType } from './common';

/**
 * Represents the schema definition for a single column.
 */
export interface ColumnSchema {
  /** The name of the column. */
  column: string;
  /** Optional: The expected Polars data type for this column. */
  type?: DataType;
  /** Optional: A specific string to be interpreted as a null value for this column. */
  nullValue?: string;
}

/**
 * Base interface for file reading operations that contains common fields
 * shared across different file format readers.
 */
export interface BaseFileReadStep {
  /** Path to the file to be read. */
  file: string;
  /** The name assigned to the loaded DataFrame in the tablespace. */
  name: string;
  /**
   * Optional: Provides schema information for specific columns.
   * If `infer_schema` is `true` (default), these definitions act as overrides
   * to the types inferred by Polars. Each `ColumnSchema` can specify a `type`
   * and/or a `nullValue`. If `infer_schema` is `false`, these definitions are
   * used directly; for columns not listed, Polars' default behavior when no
   * type is specified (e.g., reading as string) will apply.
   */
  schema?: ColumnSchema[];
  /**
   * Optional: Whether to infer the schema from the file using Polars'
   * default inference mechanism (e.g., reading a certain number of rows).
   * Defaults to `true`. If set to `false`, type inference is disabled,
   * and types will rely on the `schema` field or Polars' defaults for
   * columns not specified in `schema`.
   */
  inferSchema?: boolean;
  /**
   * Optional: Return null if parsing fails because of schema mismatches.
   * Defaults to `false`.
   */
  ignoreErrors?: boolean;
  /**
   * Optional: Stop reading after this many rows.
   * If not specified, all rows will be read.
   */
  nRows?: number;
}

/** Represents the configuration for a step that reads data from a CSV file into the tablespace. */
export interface ReadCsvStep extends BaseFileReadStep {
  /** The type of the step, which is always 'read_csv' for this operation. */
  type: 'read_csv';
  /** Optional: The delimiter character used in the CSV file. */
  delimiter?: string;
}

/** Represents the configuration for a step that reads data from an NDJSON file into the tablespace. */
export interface ReadNdjsonStep extends BaseFileReadStep {
  /** The type of the step, which is always 'read_ndjson' for this operation. */
  type: 'read_ndjson';
}

/**
 * Base interface for file writing operations that contains common fields
 * shared across different file format writers.
 */
export interface BaseFileWriteStep {
  /** The name of the table in the tablespace to be written. */
  table: string;
  /** Path to the output file. */
  file: string;
  /** Optional: A list of column names to write to the file. If omitted, all columns are written. */
  columns?: string[];
}

/**
 * Represents the configuration for a step that writes a table from the tablespace to a CSV file.
 */
export interface WriteCsvStep extends BaseFileWriteStep {
  /** The type of the step, which is always 'write_csv' for this operation. */
  type: 'write_csv';
  /** Optional: The delimiter character to use in the output CSV file. */
  delimiter?: string;
}

// Not yet supported, should be a normal write_json, but we don't have a lazy sink_json, can create a workaround
// if needed.
// /**
//  * Represents the configuration for a step that writes a table from the tablespace to a JSON file.
//  */
// export interface WriteJsonStep extends BaseFileWriteStep {
//   /** The type of the step, which is always 'write_json' for this operation. */
//   type: 'write_json';
// }

/**
 * Represents the configuration for a step that writes a table from the tablespace to an NDJSON file.
 */
export interface WriteNdjsonStep extends BaseFileWriteStep {
  /** The type of the step, which is always 'write_ndjson' for this operation. */
  type: 'write_ndjson';
}
