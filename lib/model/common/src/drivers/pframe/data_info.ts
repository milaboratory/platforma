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

/**
 * Type guard function that checks if the given value is a valid DataInfo.
 *
 * @param value - The value to check
 * @returns True if the value is a valid DataInfo, false otherwise
 */
export function isDataInfo<Blob>(value: unknown): value is DataInfo<Blob> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const data = value as Record<string, unknown>;
  if (!('type' in data)) {
    return false;
  }

  switch (data.type) {
    case 'Json':
      return (
        typeof data.keyLength === 'number'
        && data.data !== undefined
        && typeof data.data === 'object'
      );
    case 'JsonPartitioned':
      return (
        typeof data.partitionKeyLength === 'number'
        && data.parts !== undefined
        && typeof data.parts === 'object'
      );
    case 'BinaryPartitioned':
      return (
        typeof data.partitionKeyLength === 'number'
        && data.parts !== undefined
        && typeof data.parts === 'object'
      );
    default:
      return false;
  }
}

/**
 * Maps blob references in a DataInfo object from one type to another using a mapping function.
 *
 * @template B1 - Source blob type
 * @template B2 - Target blob type
 * @param dataInfo - The source DataInfo object
 * @param mapFn - Function to transform blobs from type B1 to type B2
 * @returns A new DataInfo object with transformed blob references
 */
export function mapDataInfo<B1, B2>(
  dataInfo: DataInfo<B1>,
  mapFn: (blob: B1) => B2,
): DataInfo<B2>;
export function mapDataInfo<B1, B2>(
  dataInfo: DataInfo<B1> | undefined,
  mapFn: (blob: B1) => B2,
): DataInfo<B2> | undefined;
export function mapDataInfo<B1, B2>(
  dataInfo: DataInfo<B1> | undefined,
  mapFn: (blob: B1) => B2,
): DataInfo<B2> | undefined {
  if (dataInfo === undefined) {
    return undefined;
  }

  switch (dataInfo.type) {
    case 'Json':
      // Json type doesn't contain blobs, so return as is
      return dataInfo;
    case 'JsonPartitioned': {
      // Map each blob in parts
      const newParts: Record<string, B2> = {};
      for (const [key, blob] of Object.entries(dataInfo.parts)) {
        newParts[key] = mapFn(blob);
      }
      return {
        ...dataInfo,
        parts: newParts,
      };
    }
    case 'BinaryPartitioned': {
      // Map each index and values blob in parts
      const newParts: Record<string, BinaryChunk<B2>> = {};
      for (const [key, chunk] of Object.entries(dataInfo.parts)) {
        newParts[key] = {
          index: mapFn(chunk.index),
          values: mapFn(chunk.values),
        };
      }
      return {
        ...dataInfo,
        parts: newParts,
      };
    }
  }
}

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
