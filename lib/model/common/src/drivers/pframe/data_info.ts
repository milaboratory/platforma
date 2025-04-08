/**
 * Represents a JavaScript representation of a value in a PColumn. Can be null, a number, or a string.
 * These are the primitive types that can be stored directly in PColumns.
 *
 * Note: Actual columns can hold more value types, which are converted to these JavaScript types
 * once they enter the JavaScript runtime.
 */
export type PColumnValue = null | number | string;

/**
 * Represents a key for a PColumn value.
 * Can be an array of strings or numbers.
 */
export type PColumnKey = (number | string)[];

/**
 * Represents a single entry in a PColumn's data structure.
 * Contains a key and a value.
 */
export type PColumnDataEntry<T> = {
  /** Key for the value */
  key: PColumnKey;

  /** Value / blob at the given key */
  value: T;
};

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
  key: PColumnKey;
  val: PColumnValue;
};

/**
 * Array of key-value entries representing explicit column data.
 * Used for lightweight explicit instantiation of PColumns.
 */
export type PColumnValues = PColumnValuesEntry[];

/**
 * Entry-based representation of JsonDataInfo
 */
export interface JsonDataInfoEntries {
  type: 'Json';
  keyLength: number;
  data: PColumnDataEntry<PColumnValue>[];
}

/**
 * Entry-based representation of JsonPartitionedDataInfo
 */
export interface JsonPartitionedDataInfoEntries<Blob> {
  type: 'JsonPartitioned';
  partitionKeyLength: number;
  parts: PColumnDataEntry<Blob>[];
}

/**
 * Entry-based representation of BinaryPartitionedDataInfo
 */
export interface BinaryPartitionedDataInfoEntries<Blob> {
  type: 'BinaryPartitioned';
  partitionKeyLength: number;
  parts: PColumnDataEntry<BinaryChunk<Blob>>[];
}

/**
 * Union type representing all possible entry-based partitioned data storage formats
 */
export type PartitionedDataInfoEntries<Blob> =
  | JsonPartitionedDataInfoEntries<Blob>
  | BinaryPartitionedDataInfoEntries<Blob>;

/**
 * Union type representing all possible entry-based data storage formats
 */
export type DataInfoEntries<Blob> =
  | JsonDataInfoEntries
  | PartitionedDataInfoEntries<Blob>;

/**
 * Type guard function that checks if the given value is a valid DataInfoEntries.
 *
 * @param value - The value to check
 * @returns True if the value is a valid DataInfoEntries, false otherwise
 */
export function isDataInfoEntries<Blob>(value: unknown): value is DataInfoEntries<Blob> {
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
        && Array.isArray(data.data)
      );
    case 'JsonPartitioned':
      return (
        typeof data.partitionKeyLength === 'number'
        && Array.isArray(data.parts)
      );
    case 'BinaryPartitioned':
      return (
        typeof data.partitionKeyLength === 'number'
        && Array.isArray(data.parts)
      );
    default:
      return false;
  }
}

/**
 * Converts DataInfo to DataInfoEntries
 *
 * @param dataInfo - The record-based DataInfo object
 * @returns The equivalent entry-based DataInfoEntries object
 */
export function dataInfoToEntries<Blob>(dataInfo: DataInfo<Blob>): DataInfoEntries<Blob> {
  switch (dataInfo.type) {
    case 'Json': {
      const entries: PColumnDataEntry<PColumnValue>[] = Object.entries(dataInfo.data).map(([keyStr, value]) => {
        const key = JSON.parse(keyStr) as PColumnKey;
        return { key, value };
      });

      return {
        type: 'Json',
        keyLength: dataInfo.keyLength,
        data: entries,
      };
    }
    case 'JsonPartitioned': {
      const parts: PColumnDataEntry<Blob>[] = Object.entries(dataInfo.parts).map(([keyStr, blob]) => {
        const key = JSON.parse(keyStr) as PColumnKey;
        return { key, value: blob };
      });

      return {
        type: 'JsonPartitioned',
        partitionKeyLength: dataInfo.partitionKeyLength,
        parts,
      };
    }
    case 'BinaryPartitioned': {
      const parts: PColumnDataEntry<BinaryChunk<Blob>>[] = Object.entries(dataInfo.parts).map(([keyStr, chunk]) => {
        const key = JSON.parse(keyStr) as PColumnKey;
        return { key, value: chunk };
      });

      return {
        type: 'BinaryPartitioned',
        partitionKeyLength: dataInfo.partitionKeyLength,
        parts,
      };
    }
  }
}

/**
 * Converts DataInfoEntries to DataInfo
 *
 * @param dataInfoEntries - The entry-based DataInfoEntries object
 * @returns The equivalent record-based DataInfo object
 */
export function entriesToDataInfo<Blob>(dataInfoEntries: DataInfoEntries<Blob>): DataInfo<Blob> {
  switch (dataInfoEntries.type) {
    case 'Json': {
      const data: Record<string, PColumnValue> = {};
      for (const entry of dataInfoEntries.data) {
        data[JSON.stringify(entry.key)] = entry.value;
      }

      return {
        type: 'Json',
        keyLength: dataInfoEntries.keyLength,
        data,
      };
    }
    case 'JsonPartitioned': {
      const parts: Record<string, Blob> = {};
      for (const entry of dataInfoEntries.parts) {
        parts[JSON.stringify(entry.key)] = entry.value;
      }

      return {
        type: 'JsonPartitioned',
        partitionKeyLength: dataInfoEntries.partitionKeyLength,
        parts,
      };
    }
    case 'BinaryPartitioned': {
      const parts: Record<string, BinaryChunk<Blob>> = {};
      for (const entry of dataInfoEntries.parts) {
        parts[JSON.stringify(entry.key)] = entry.value;
      }

      return {
        type: 'BinaryPartitioned',
        partitionKeyLength: dataInfoEntries.partitionKeyLength,
        parts,
      };
    }
  }
}

/**
 * Maps blob references in a DataInfoEntries object from one type to another using a mapping function.
 *
 * @template B1 - Source blob type
 * @template B2 - Target blob type
 * @param dataInfoEntries - The source DataInfoEntries object
 * @param mapFn - Function to transform blobs from type B1 to type B2
 * @returns A new DataInfoEntries object with transformed blob references
 */
export function mapDataInfoEntries<B1, B2>(
  dataInfoEntries: DataInfoEntries<B1>,
  mapFn: (blob: B1) => B2,
): DataInfoEntries<B2>;
export function mapDataInfoEntries<B1, B2>(
  dataInfoEntries: DataInfoEntries<B1> | undefined,
  mapFn: (blob: B1) => B2,
): DataInfoEntries<B2> | undefined {
  if (dataInfoEntries === undefined) {
    return undefined;
  }

  switch (dataInfoEntries.type) {
    case 'Json':
      // Json type doesn't contain blobs, so return as is
      return dataInfoEntries;
    case 'JsonPartitioned': {
      // Map each blob in parts
      const newParts = dataInfoEntries.parts.map((entry) => ({
        key: entry.key,
        value: mapFn(entry.value),
      }));

      return {
        ...dataInfoEntries,
        parts: newParts,
      };
    }
    case 'BinaryPartitioned': {
      // Map each index and values blob in parts
      const newParts = dataInfoEntries.parts.map((entry) => ({
        key: entry.key,
        value: {
          index: mapFn(entry.value.index),
          values: mapFn(entry.value.values),
        },
      }));

      return {
        ...dataInfoEntries,
        parts: newParts,
      };
    }
  }
}
