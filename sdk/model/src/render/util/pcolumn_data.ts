import type { TreeNodeAccessor } from '../accessor';

const PCD_PREFIX = 'PColumnData/';

export const RT_RESOURCE_MAP = PCD_PREFIX + 'ResourceMap';
export const RT_RESOURCE_MAP_PARTITIONED = PCD_PREFIX + 'Partitioned/ResourceMap';

export const RT_JSON_PARTITIONED = PCD_PREFIX + 'JsonPartitioned';
export const RT_BINARY_PARTITIONED = PCD_PREFIX + 'BinaryPartitioned';

const PCD_SUP_PREFIX = PCD_PREFIX + 'Partitioned/';
export const RT_JSON_SUPER_PARTITIONED = PCD_SUP_PREFIX + 'JsonPartitioned';
export const RT_BINARY_SUPER_PARTITIONED = PCD_SUP_PREFIX + 'BinaryPartitioned';

export type PColumnKey = (string | number)[];

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

const removeIndexSuffix = (keyStr: string): string | undefined => {
  if (keyStr.endsWith('.index')) {
    return undefined;
  } else if (keyStr.endsWith('.values')) {
    return keyStr.substring(0, keyStr.length - 7);
  } else {
    throw Error(`key must ends on .index/.values for binary p-column, got: ${keyStr}`);
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
          const k = removeIndexSuffix(keyStr);
          if (!k) continue;
          else keyStr = k;
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
              const k = removeIndexSuffix(keyStr);
              if (!k) continue;
              else keyStr = k;
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
