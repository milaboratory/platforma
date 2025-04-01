/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  type BinaryChunk,
  type BinaryPartitionedDataInfoEntries,
  type DataInfoEntries,
  type JsonPartitionedDataInfoEntries,
  type PColumnDataEntry,
  type PColumnKey,
} from '@milaboratories/pl-model-common';
import type { TreeNodeAccessor } from '../accessor';

const PCD_PREFIX = 'PColumnData/';

export const RT_RESOURCE_MAP = PCD_PREFIX + 'ResourceMap';
export const RT_RESOURCE_MAP_PARTITIONED = PCD_PREFIX + 'Partitioned/ResourceMap';

export const RT_JSON_PARTITIONED = PCD_PREFIX + 'JsonPartitioned';
export const RT_BINARY_PARTITIONED = PCD_PREFIX + 'BinaryPartitioned';

const PCD_SUP_PREFIX = PCD_PREFIX + 'Partitioned/';
export const RT_JSON_SUPER_PARTITIONED = PCD_SUP_PREFIX + 'JsonPartitioned';
export const RT_BINARY_SUPER_PARTITIONED = PCD_SUP_PREFIX + 'BinaryPartitioned';

export type PColumnResourceMapEntry<T> = {
  key: PColumnKey;
  value: T;
};

export type PColumnResourceMapData<T> = {
  isComplete: boolean;
  data: PColumnResourceMapEntry<T>[];
};

function populateResourceMapData<T>(
  acc: TreeNodeAccessor | undefined,
  resourceParser: (acc: TreeNodeAccessor) => T | undefined,
  data: PColumnResourceMapEntry<T | undefined>[],
  keyPrefix: PColumnKey = [],
  addEntriesWithNoData: boolean,
): boolean {
  if (acc === undefined) return false;
  switch (acc.resourceType.name) {
    case RT_RESOURCE_MAP: {
      let isComplete = acc.getInputsLocked();
      for (const keyStr of acc.listInputFields()) {
        const value = acc.resolve({ field: keyStr, assertFieldType: 'Input' });
        const key = [...keyPrefix, ...JSON.parse(keyStr)] as PColumnKey;
        const converted = value === undefined ? undefined : resourceParser(value);
        if (converted === undefined) isComplete = false;
        if (converted !== undefined || addEntriesWithNoData) data.push({ key, value: converted });
      }
      return isComplete;
    }
    case RT_RESOURCE_MAP_PARTITIONED: {
      let isComplete = acc.getInputsLocked();
      for (const keyStr of acc.listInputFields()) {
        const value = acc.resolve({ field: keyStr, assertFieldType: 'Input' });
        if (value === undefined) isComplete = false;
        else {
          const key = [...keyPrefix, ...JSON.parse(keyStr)] as PColumnKey;
          const populateResult = populateResourceMapData(
            value,
            resourceParser,
            data,
            key,
            addEntriesWithNoData,
          );
          isComplete = isComplete && populateResult;
        }
      }
      return isComplete;
    }
    default:
      throw new Error(`Unknown resource type: ${acc.resourceType.name}`);
  }
}

export function parseResourceMap<T>(
  acc: TreeNodeAccessor | undefined,
  resourceParser: (acc: TreeNodeAccessor) => T | undefined,
  addEntriesWithNoData: false
): PColumnResourceMapData<NonNullable<T>>;
export function parseResourceMap<T>(
  acc: TreeNodeAccessor | undefined,
  resourceParser: (acc: TreeNodeAccessor) => T | undefined,
  addEntriesWithNoData: true
): PColumnResourceMapData<T | undefined>;
export function parseResourceMap<T>(
  acc: TreeNodeAccessor | undefined,
  resourceParser: (acc: TreeNodeAccessor) => T | undefined,
  addEntriesWithNoData: boolean = false,
): PColumnResourceMapData<T | undefined> {
  const data: PColumnResourceMapEntry<T | undefined>[] = [];
  const isComplete = populateResourceMapData(acc, resourceParser, data, [], addEntriesWithNoData);
  return { isComplete, data };
}

export type PColumnKeyList = {
  /** array of keys */
  data: PColumnKey[];
  /** length of partition key */
  keyLength: number;
};

const removeIndexSuffix = (keyStr: string): { baseKey: string; type: 'index' | 'values' } => {
  if (keyStr.endsWith('.index')) {
    return { baseKey: keyStr.substring(0, keyStr.length - 6), type: 'index' };
  } else if (keyStr.endsWith('.values')) {
    return { baseKey: keyStr.substring(0, keyStr.length - 7), type: 'values' };
  } else {
    throw new Error(`key must ends on .index/.values for binary p-column, got: ${keyStr}`);
  }
};

// @TODO define a class with various resource map operations
/** Returns a list of all partition keys appeared in the p-column */
export function getPartitionKeysList(
  acc: TreeNodeAccessor | undefined,
): PColumnKeyList | undefined {
  if (!acc) return undefined;

  const rt = acc.resourceType.name;
  const meta = acc.getDataAsJson<Record<string, number>>();
  const data: PColumnKey[] = [];

  let keyLength = 0;
  // @TODO validate meta shape
  switch (rt) {
    case RT_RESOURCE_MAP:
      keyLength = meta['keyLength'];
      break;

    case RT_RESOURCE_MAP_PARTITIONED:
      keyLength = meta['partitionKeyLength'] + meta['keyLength'];
      break;

    case RT_JSON_PARTITIONED:
    case RT_BINARY_PARTITIONED:
      keyLength = meta['partitionKeyLength'];
      break;

    case RT_BINARY_SUPER_PARTITIONED:
    case RT_JSON_SUPER_PARTITIONED:
      keyLength = meta['superPartitionKeyLength'] + meta['partitionKeyLength'];
      break;
  }

  switch (rt) {
    case RT_RESOURCE_MAP:
    case RT_JSON_PARTITIONED:
    case RT_BINARY_PARTITIONED:
      for (let keyStr of acc.listInputFields()) {
        if (rt === RT_BINARY_PARTITIONED) {
          keyStr = removeIndexSuffix(keyStr).baseKey;
        }
        const key = [...JSON.parse(keyStr)] as PColumnKey;
        data.push(key);
      }

      break;

    case RT_RESOURCE_MAP_PARTITIONED:
    case RT_BINARY_SUPER_PARTITIONED:
    case RT_JSON_SUPER_PARTITIONED:
      for (const supKeyStr of acc.listInputFields()) {
        const keyPrefix = [...JSON.parse(supKeyStr)] as PColumnKey;

        const value = acc.resolve({ field: supKeyStr, assertFieldType: 'Input' });
        if (value !== undefined) {
          for (let keyStr of value.listInputFields()) {
            if (rt === RT_BINARY_SUPER_PARTITIONED) {
              keyStr = removeIndexSuffix(keyStr).baseKey;
            }
            const key = [...keyPrefix, ...JSON.parse(keyStr)] as PColumnKey;
            data.push(key);
          }
        }
      }
      break;
  }

  return { data, keyLength };
}

/** Returns an array of unique partition keys for each column: the i-th element in the resulting 2d array contains all unique values of i-th partition axis. */
// @TODO define a class with various resource map operations
export function getUniquePartitionKeys(
  acc: TreeNodeAccessor | undefined,
): (string | number)[][] | undefined {
  const list = getPartitionKeysList(acc);
  if (!list) return undefined;

  const { data, keyLength } = list;

  const result: Set<string | number>[] = [];

  for (let i = 0; i < keyLength; ++i) {
    result.push(new Set());
  }

  for (const l of data) {
    if (l.length !== keyLength) {
      throw new Error('key length does not match partition length');
    }
    for (let i = 0; i < keyLength; ++i) {
      result[i].add(l[i]);
    }
  }

  return result.map((s) => Array.from(s.values()));
}

/**
 * Parses the PColumn data from a TreeNodeAccessor into a DataInfoEntries structure.
 * Returns undefined if any required data is missing.
 * Throws error on validation failures.
 *
 * @param acc - The TreeNodeAccessor containing PColumn data
 * @param keyPrefix - Optional key prefix for recursive calls
 * @returns DataInfoEntries representation of the PColumn data, or undefined if incomplete
 */
export function parsePColumnData(
  acc: TreeNodeAccessor | undefined,
  keyPrefix: PColumnKey = [],
): JsonPartitionedDataInfoEntries<TreeNodeAccessor> | BinaryPartitionedDataInfoEntries<TreeNodeAccessor> | undefined {
  if (acc === undefined) return undefined;

  const resourceType = acc.resourceType.name;
  const meta = acc.getDataAsJson<Record<string, number>>();

  // Prevent recursive super-partitioned resources
  if (keyPrefix.length > 0
    && (resourceType === RT_JSON_SUPER_PARTITIONED || resourceType === RT_BINARY_SUPER_PARTITIONED)) {
    throw new Error(`Unexpected nested super-partitioned resource: ${resourceType}`);
  }

  switch (resourceType) {
    case RT_RESOURCE_MAP:
    case RT_RESOURCE_MAP_PARTITIONED:
      throw new Error(`Only data columns are supported, got: ${resourceType}`);

    case RT_JSON_PARTITIONED: {
      if (typeof meta?.partitionKeyLength !== 'number') {
        throw new Error(`Missing partitionKeyLength in metadata for ${resourceType}`);
      }

      const parts: PColumnDataEntry<TreeNodeAccessor>[] = [];
      for (const keyStr of acc.listInputFields()) {
        const value = acc.resolve({ field: keyStr, assertFieldType: 'Input' });
        if (value === undefined) return undefined;

        const key = [...keyPrefix, ...JSON.parse(keyStr)];
        parts.push({ key, value });
      }

      return {
        type: 'JsonPartitioned',
        partitionKeyLength: meta.partitionKeyLength,
        parts,
      };
    }

    case RT_BINARY_PARTITIONED: {
      if (typeof meta?.partitionKeyLength !== 'number') {
        throw new Error(`Missing partitionKeyLength in metadata for ${resourceType}`);
      }

      const parts: PColumnDataEntry<BinaryChunk<TreeNodeAccessor>>[] = [];
      const baseKeys = new Map<string, { index?: TreeNodeAccessor; values?: TreeNodeAccessor }>();

      // Group fields by base key (without .index/.values suffix)
      for (const keyStr of acc.listInputFields()) {
        const suffix = removeIndexSuffix(keyStr);

        const value = acc.resolve({ field: keyStr, assertFieldType: 'Input' });
        if (value === undefined) return undefined;

        let entry = baseKeys.get(suffix.baseKey);
        if (!entry) {
          entry = {};
          baseKeys.set(suffix.baseKey, entry);
        }

        if (suffix.type === 'index') {
          entry.index = value;
        } else {
          entry.values = value;
        }
      }

      // Process complete binary chunks only
      for (const [baseKeyStr, entry] of baseKeys.entries()) {
        if (!entry.index || !entry.values) return undefined;

        const key = [...keyPrefix, ...JSON.parse(baseKeyStr)];
        parts.push({
          key,
          value: {
            index: entry.index,
            values: entry.values,
          },
        });
      }

      return {
        type: 'BinaryPartitioned',
        partitionKeyLength: meta.partitionKeyLength,
        parts,
      };
    }

    case RT_JSON_SUPER_PARTITIONED: {
      if (typeof meta?.superPartitionKeyLength !== 'number'
        || typeof meta?.partitionKeyLength !== 'number') {
        throw new Error(`Missing superPartitionKeyLength or partitionKeyLength in metadata for ${resourceType}`);
      }

      const totalKeyLength = meta.superPartitionKeyLength + meta.partitionKeyLength;
      const parts: PColumnDataEntry<TreeNodeAccessor>[] = [];

      // Process all super partitions
      for (const supKeyStr of acc.listInputFields()) {
        const superPartition = acc.resolve({ field: supKeyStr, assertFieldType: 'Input' });
        if (superPartition === undefined) return undefined;

        // Validate inner type
        if (superPartition.resourceType.name !== RT_JSON_PARTITIONED) {
          throw new Error(`Expected ${RT_JSON_PARTITIONED} inside ${resourceType}, but got ${superPartition.resourceType.name}`);
        }

        const innerResult = parsePColumnData(superPartition, JSON.parse(supKeyStr) as PColumnKey);

        if (innerResult === undefined) return undefined;

        if (innerResult.type !== 'JsonPartitioned')
          throw new Error(`Unexpected inner result type for ${resourceType}: ${innerResult.type}`);

        parts.push(...innerResult.parts);
      }

      return {
        type: 'JsonPartitioned',
        partitionKeyLength: totalKeyLength,
        parts,
      };
    }

    case RT_BINARY_SUPER_PARTITIONED: {
      if (typeof meta?.superPartitionKeyLength !== 'number'
        || typeof meta?.partitionKeyLength !== 'number') {
        throw new Error(`Missing superPartitionKeyLength or partitionKeyLength in metadata for ${resourceType}`);
      }

      const totalKeyLength = meta.superPartitionKeyLength + meta.partitionKeyLength;
      const parts: PColumnDataEntry<BinaryChunk<TreeNodeAccessor>>[] = [];

      // Process all super partitions
      for (const supKeyStr of acc.listInputFields()) {
        const superPartition = acc.resolve({ field: supKeyStr, assertFieldType: 'Input' });
        if (superPartition === undefined) return undefined;

        // Validate inner type
        if (superPartition.resourceType.name !== RT_BINARY_PARTITIONED) {
          throw new Error(`Expected ${RT_BINARY_PARTITIONED} inside ${resourceType}, but got ${superPartition.resourceType.name}`);
        }

        const innerResult = parsePColumnData(superPartition, JSON.parse(supKeyStr) as PColumnKey);

        if (innerResult === undefined) return undefined;

        if (innerResult.type !== 'BinaryPartitioned')
          throw new Error(`Unexpected inner result type for ${resourceType}: ${innerResult.type}`);

        parts.push(...innerResult.parts);
      }

      return {
        type: 'BinaryPartitioned',
        partitionKeyLength: totalKeyLength,
        parts,
      };
    }

    default:
      throw new Error(`Unknown resource type: ${resourceType}`);
  }
}
