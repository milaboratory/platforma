import {
  PFrameDriverError,
  type BinaryChunk,
  type ParquetChunk,
  type ParquetChunkMapping,
  type ParquetChunkMetadata,
  type PColumnValue,
  type PlRef,
  type PObjectId,
  type PObjectSpec,
} from '@platforma-sdk/model';
import type { PlTreeEntry, PlTreeNodeAccessor } from '@milaboratories/pl-tree';
import canonicalize from 'canonicalize';
import {
  isNullResourceId,
  resourceType,
  resourceTypeToString,
  resourceTypesEqual,
} from '@milaboratories/pl-client';
import type { Writable } from 'utility-types';
import { createHash } from 'node:crypto';
import type { PFrameInternal } from '@milaboratories/pl-model-middle-layer';

export const PColumnDataJsonPartitioned = resourceType('PColumnData/JsonPartitioned', '1');
export const PColumnDataJsonSuperPartitioned = resourceType(
  'PColumnData/Partitioned/JsonPartitioned',
  '1',
);
export const PColumnDataBinaryPartitioned = resourceType('PColumnData/BinaryPartitioned', '1');
export const PColumnDataBinarySuperPartitioned = resourceType(
  'PColumnData/Partitioned/BinaryPartitioned',
  '1',
);
export const PColumnDataParquetPartitioned = resourceType('PColumnData/ParquetPartitioned', '1');
export const PColumnDataParquetSuperPartitioned = resourceType(
  'PColumnData/Partitioned/ParquetPartitioned',
  '1',
);
export const PColumnDataJson = resourceType('PColumnData/Json', '1');

export const ParquetChunkResourceType = resourceType('ParquetChunk', '1');

export type PColumnDataJsonResourceValue = {
  keyLength: number;
  data: Record<string, PColumnValue>;
};

export type PColumnDataPartitionedResourceValue = {
  partitionKeyLength: number;
};

export type PColumnDataSuperPartitionedResourceValue = {
  superPartitionKeyLength: number;
  partitionKeyLength: number;
};

const BinaryPartitionedIndexFieldSuffix = '.index';
const BinaryPartitionedValuesFieldSuffix = '.values';

export function parseDataInfoResource(
  data: PlTreeNodeAccessor,
): PFrameInternal.DataInfo<PlTreeEntry> {
  if (!data.getIsReadyOrError()) throw new PFrameDriverError('Data not ready.');

  const resourceData = data.getDataAsJson();
  if (resourceData === undefined)
    throw new PFrameDriverError('unexpected data info structure, no resource data');

  if (resourceTypesEqual(data.resourceType, PColumnDataJson)) {
    const dataContent = resourceData as PColumnDataJsonResourceValue;

    return {
      type: 'Json',
      keyLength: dataContent.keyLength,
      data: dataContent.data,
    };
  } else if (resourceTypesEqual(data.resourceType, PColumnDataJsonPartitioned)) {
    const meta = resourceData as PColumnDataPartitionedResourceValue;

    const parts = Object.fromEntries(
      data
        .listInputFields()
        .map((field) => [field, data.traverse({ field, errorIfFieldNotSet: true }).persist()]),
    );

    return {
      type: 'JsonPartitioned',
      partitionKeyLength: meta.partitionKeyLength,
      parts,
    };
  } else if (resourceTypesEqual(data.resourceType, PColumnDataJsonSuperPartitioned)) {
    const meta = resourceData as PColumnDataSuperPartitionedResourceValue;

    const parts: Record<string, PlTreeEntry> = {};
    for (const superKey of data.listInputFields()) {
      const superPart = data.traverse({ field: superKey, errorIfFieldNotSet: true });
      const keys = superPart.listInputFields();
      if (keys === undefined) throw new PFrameDriverError(`no partition keys for super key ${superKey}`);

      for (const key of keys) {
        const partKey = JSON.stringify([
          ...JSON.parse(superKey) as PColumnValue[],
          ...JSON.parse(key) as PColumnValue[]]);
        parts[partKey] = superPart.traverse({ field: key, errorIfFieldNotSet: true }).persist();
      }
    }

    return {
      type: 'JsonPartitioned',
      partitionKeyLength: meta.superPartitionKeyLength + meta.partitionKeyLength,
      parts,
    };
  } else if (resourceTypesEqual(data.resourceType, PColumnDataBinaryPartitioned)) {
    const meta = resourceData as PColumnDataPartitionedResourceValue;

    const parts: Record<
      string,
      Partial<Writable<BinaryChunk<PlTreeEntry>>>
    > = {};

    // parsing the structure
    for (const field of data.listInputFields()) {
      if (field.endsWith(BinaryPartitionedIndexFieldSuffix)) {
        const partKey = field.slice(0, -BinaryPartitionedIndexFieldSuffix.length);
        let part = parts[partKey];
        if (part === undefined) {
          part = {};
          parts[partKey] = part;
        }
        part.index = data.traverse({ field, errorIfFieldNotSet: true }).persist();
      } else if (field.endsWith(BinaryPartitionedValuesFieldSuffix)) {
        const partKey = field.slice(0, -BinaryPartitionedValuesFieldSuffix.length);
        let part = parts[partKey];
        if (part === undefined) {
          part = {};
          parts[partKey] = part;
        }
        part.values = data.traverse({ field, errorIfFieldNotSet: true }).persist();
      } else throw new PFrameDriverError(`unrecognized part field name: ${field}`);
    }

    // structure validation
    for (const [key, part] of Object.entries(parts)) {
      if (part.index === undefined) throw new PFrameDriverError(`no index for part ${key}`);
      if (part.values === undefined) throw new PFrameDriverError(`no values for part ${key}`);
    }

    return {
      type: 'BinaryPartitioned',
      partitionKeyLength: meta.partitionKeyLength,
      parts: parts as Record<string, BinaryChunk<PlTreeEntry>>,
    };
  } else if (resourceTypesEqual(data.resourceType, PColumnDataBinarySuperPartitioned)) {
    const meta = resourceData as PColumnDataSuperPartitionedResourceValue;

    const parts: Record<
      string,
      Partial<Writable<BinaryChunk<PlTreeEntry>>>
    > = {};
    for (const superKey of data.listInputFields()) {
      const superData = data.traverse({ field: superKey, errorIfFieldNotSet: true });
      const keys = superData.listInputFields();
      if (keys === undefined) throw new PFrameDriverError(`no partition keys for super key ${superKey}`);

      for (const field of keys) {
        if (field.endsWith(BinaryPartitionedIndexFieldSuffix)) {
          const key = field.slice(0, -BinaryPartitionedIndexFieldSuffix.length);

          const partKey = JSON.stringify([
            ...JSON.parse(superKey) as PColumnValue[],
            ...JSON.parse(key) as PColumnValue[]]);
          let part = parts[partKey];
          if (part === undefined) {
            part = {};
            parts[partKey] = part;
          }
          parts[partKey].index = superData.traverse({
            field,
            errorIfFieldNotSet: true,
          }).persist();
        } else if (field.endsWith(BinaryPartitionedValuesFieldSuffix)) {
          const key = field.slice(0, -BinaryPartitionedValuesFieldSuffix.length);

          const partKey = JSON.stringify([
            ...JSON.parse(superKey) as PColumnValue[],
            ...JSON.parse(key) as PColumnValue[]]);
          let part = parts[partKey];
          if (part === undefined) {
            part = {};
            parts[partKey] = part;
          }
          parts[partKey].values = superData.traverse({
            field,
            errorIfFieldNotSet: true,
          }).persist();
        } else throw new PFrameDriverError(`unrecognized part field name: ${field}`);
      }
    }

    return {
      type: 'BinaryPartitioned',
      partitionKeyLength: meta.superPartitionKeyLength + meta.partitionKeyLength,
      parts: parts as Record<string, BinaryChunk<PlTreeEntry>>,
    };
  } else if (resourceTypesEqual(data.resourceType, PColumnDataParquetPartitioned)) {
    const meta = resourceData as PColumnDataPartitionedResourceValue;

    const parts: Record<string, ParquetChunk<PlTreeEntry>> = {};
    for (const key of data.listInputFields()) {
      const resource = data.traverse({ field: key, assertFieldType: 'Input', errorIfFieldNotSet: true });

      parts[key] = traverseParquetChunkResource(resource);
    }

    return {
      type: 'ParquetPartitioned',
      partitionKeyLength: meta.partitionKeyLength,
      parts,
    };
  } else if (resourceTypesEqual(data.resourceType, PColumnDataParquetSuperPartitioned)) {
    const meta = resourceData as PColumnDataSuperPartitionedResourceValue;

    const parts: Record<string, ParquetChunk<PlTreeEntry>> = {};
    for (const superKey of data.listInputFields()) {
      const superPart = data.traverse({ field: superKey, errorIfFieldNotSet: true });
      const keys = superPart.listInputFields();
      if (keys === undefined) throw new PFrameDriverError(`no partition keys for super key ${superKey}`);

      for (const key of keys) {
        const resource = data.traverse({ field: key, errorIfFieldNotSet: true });

        const partKey = JSON.stringify([
          ...JSON.parse(superKey) as PColumnValue[],
          ...JSON.parse(key) as PColumnValue[],
        ]);
        parts[partKey] = traverseParquetChunkResource(resource);
      }
    }

    return {
      type: 'ParquetPartitioned',
      partitionKeyLength: meta.superPartitionKeyLength + meta.partitionKeyLength,
      parts,
    };
  }

  throw new PFrameDriverError(`unsupported resource type: ${resourceTypeToString(data.resourceType)}`);
}

export function traverseParquetChunkResource(resource: PlTreeNodeAccessor): ParquetChunk<PlTreeEntry> {
  if (!resourceTypesEqual(resource.resourceType, ParquetChunkResourceType)) {
    throw new PFrameDriverError(
      `unknown resource type: ${resourceTypeToString(resource.resourceType)}, `
      + `expected: ${resourceTypeToString(ParquetChunkResourceType)}`,
    );
  }

  const blob = resource.traverse(
    { field: 'blob', assertFieldType: 'Service', errorIfFieldNotSet: true },
  ).persist();
  const partInfo = resource.getDataAsJson() as ParquetChunkMetadata;
  const mapping = resource.traverse(
    { field: 'mapping', assertFieldType: 'Service', errorIfFieldNotSet: true },
  ).getDataAsJson() as ParquetChunkMapping;

  return {
    data: blob,
    ...partInfo,
    ...mapping,
  };
}

export function deriveLegacyPObjectId(spec: PObjectSpec, data: PlTreeNodeAccessor): PObjectId {
  const hash = createHash('sha256');
  hash.update(canonicalize(spec)!);
  hash.update(String(!isNullResourceId(data.originalId) ? data.originalId : data.id));
  return hash.digest().toString('hex') as PObjectId;
}

export function deriveGlobalPObjectId(blockId: string, exportName: string): PObjectId {
  return canonicalize({ __isRef: true, blockId, name: exportName } satisfies PlRef)! as PObjectId;
}

export function deriveLocalPObjectId(resolvePath: string[], outputName: string): PObjectId {
  return canonicalize({ resolvePath, name: outputName })! as PObjectId;
}
