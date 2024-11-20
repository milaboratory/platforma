import { TreeNodeAccessor } from "../accessor";

export const ResourceMapResourceTypeName = 'PColumnData/ResourceMap';
export const ResourceMapResourcePartitionedTypeName = 'PColumnData/Partitioned/ResourceMap';

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
  addEntriesWithNoData: boolean
): boolean {
  if (acc === undefined) return false;
  switch (acc.resourceType.name) {
    case ResourceMapResourceTypeName: {
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
    case ResourceMapResourcePartitionedTypeName: {
      let isComplete = acc.getInputsLocked();
      for (const keyStr of acc.listInputFields()) {
        const value = acc.resolve({ field: keyStr, assertFieldType: 'Input' });
        if (value === undefined) isComplete = false;
        else {
          const key = [...keyPrefix, ...JSON.parse(keyStr)] as PColumnKey;
          const populateResult = populateResourceMapData(value, resourceParser, data, key, addEntriesWithNoData)
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
  addEntriesWithNoData: boolean = false
): PColumnResourceMapData<T | undefined> {
  const data: PColumnResourceMapEntry<T | undefined>[] = [];
  const isComplete = populateResourceMapData(acc, resourceParser, data, [], addEntriesWithNoData);
  return { isComplete, data };
}
