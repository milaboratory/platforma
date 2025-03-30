/**
 * Represents a JavaScript representation of a value in a PColumn. Can be null, a number, or a string.
 * These are the primitive types that can be stored directly in PColumns.
 *
 * Note: Actual columns can hold more value types, which are converted to these JavaScript types
 * once they enter the JavaScript runtime.
 */
export type PColumnValue = null | number | string;

/**
 * Represents column data stored as a simple JSON structure.
 * Used for small datasets that can be efficiently stored directly in memory.
 */
export type JsonDataInfo = {
  /** Identifier for this data format ('Json') */
  type: 'Json';

  /** Number of axes that make up the complete key (tuple length) */
  keyLength: number;

  /**
   * Key-value pairs where keys are stringified tuples of axis values
   * and values are the column values for those coordinates
   */
  data: Record<string, PColumnValue>;
};

/**
 * Represents column data partitioned across multiple JSON blobs.
 * Used for larger datasets that need to be split into manageable chunks.
 */
export type JsonPartitionedDataInfo<Blob> = {
  /** Identifier for this data format ('JsonPartitioned') */
  type: 'JsonPartitioned';

  /** Number of leading axes used for partitioning */
  partitionKeyLength: number;

  /** Map of stringified partition keys to blob references */
  parts: Record<string, Blob>;
};

/**
 * Represents a binary format chunk containing index and values as separate blobs.
 * Used for efficient storage and retrieval of column data in binary format.
 */
export type BinaryChunk<Blob> = {
  /** Binary blob containing structured index information */
  index: Blob;

  /** Binary blob containing the actual values */
  values: Blob;
};

/**
 * Represents column data partitioned across multiple binary chunks.
 * Optimized for efficient storage and retrieval of large datasets.
 */
export type BinaryPartitionedDataInfo<Blob> = {
  /** Identifier for this data format ('BinaryPartitioned') */
  type: 'BinaryPartitioned';

  /** Number of leading axes used for partitioning */
  partitionKeyLength: number;

  /** Map of stringified partition keys to binary chunks */
  parts: Record<string, BinaryChunk<Blob>>;
};

/**
 * Union type representing all possible data storage formats for PColumn data.
 * The specific format used depends on data size, access patterns, and performance requirements.
 *
 * @template Blob - Type parameter representing the storage reference type (could be ResourceInfo, PFrameBlobId, etc.)
 */
export type DataInfo<Blob> =
  | JsonDataInfo
  | JsonPartitionedDataInfo<Blob>
  | BinaryPartitionedDataInfo<Blob>;

//
// Lightway representation for ExplicitJsonData
//

/**
 * Represents a single key-value entry in a column's explicit data structure.
 * Used when directly instantiating PColumns with explicit data.
 */
export type PColumnValuesEntry = {
  /** Array of axis values that form the coordinates for this data point */
  key: PColumnValue[];

  /** The column value at these coordinates */
  val: PColumnValue;
};

/**
 * Array of key-value entries representing explicit column data.
 * Used for lightweight explicit instantiation of PColumns.
 */
export type PColumnValues = PColumnValuesEntry[];
