import { PColumnSpec, PColumnValues, PlRef, PObjectId, PObjectSpec } from '@platforma-sdk/model';
import { PFrameInternal } from '@milaboratories/pl-model-middle-layer';
import { PlTreeNodeAccessor, ResourceInfo } from '@milaboratories/pl-tree';
import { assertNever } from '@milaboratories/ts-helpers';
import canonicalize from 'canonicalize';
import {
  resourceType,
  resourceTypeToString,
  resourceTypesEqual
} from '@milaboratories/pl-client';
import { Writable } from 'utility-types';

export function* allBlobs<B>(data: PFrameInternal.DataInfo<B>): Generator<B> {
  switch (data.type) {
    case 'Json':
      return;
    case 'JsonPartitioned':
      for (const [, blob] of Object.entries(data.parts)) yield blob;
      return;
    case 'BinaryPartitioned':
      for (const [, { index, values }] of Object.entries(data.parts)) {
        yield index;
        yield values;
      }
      return;
    default:
      assertNever(data);
  }
}

function mapValues<T extends object, TResult>(
  obj: T,
  callback: (v: T[keyof T], key: keyof T) => TResult
): { [P in keyof T]: TResult } {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [key, callback(value, key as any)])
  ) as any;
}

export function mapBlobs<B1, B2>(
  data: PFrameInternal.DataInfo<B1>,
  mapping: (blob: B1) => B2
): PFrameInternal.DataInfo<B2> {
  switch (data.type) {
    case 'Json':
      return { ...data };
    case 'JsonPartitioned':
      return { ...data, parts: mapValues(data.parts, mapping) };
    case 'BinaryPartitioned':
      return {
        ...data,
        parts: mapValues(data.parts, (v) => ({
          index: mapping(v.index),
          values: mapping(v.values)
        }))
      };
    default:
      assertNever(data);
  }
}

export const PColumnDataJsonPartitioned = resourceType('PColumnData/JsonPartitioned', '1');
export const PColumnDataJsonSuperPartitioned = resourceType(
  'PColumnData/Partitioned/JsonPartitioned',
  '1'
);
export const PColumnDataBinaryPartitioned = resourceType('PColumnData/BinaryPartitioned', '1');
export const PColumnDataBinarySuperPartitioned = resourceType(
  'PColumnData/Partitioned/BinaryPartitioned',
  '1'
);
export const PColumnDataJson = resourceType('PColumnData/Json', '1');

export type PColumnDataJsonResourceValue = {
  keyLength: number;
  data: Record<string, PFrameInternal.JsonDataValue>;
};

export type PColumnDataPartitionedResourceValue = {
  partitionKeyLength: number;
};

export type PColumnDataSuperPartitionedResourceValue = {
  superPartitionKeyLength: number;
  partitionKeyLength: number;
};

export function parseDataInfoResource(
  data: PlTreeNodeAccessor
): PFrameInternal.DataInfo<ResourceInfo> {
  if (!data.getIsReadyOrError()) throw new Error('Data not ready.');

  const resourceData = data.getDataAsJson();
  if (resourceData === undefined)
    throw new Error('unexpected data info structure, no resource data');

  if (resourceTypesEqual(data.resourceType, PColumnDataJson)) {
    const dataContent = resourceData as PColumnDataJsonResourceValue;

    return {
      type: 'Json',
      keyLength: dataContent.keyLength,
      data: dataContent.data
    };
  } else if (resourceTypesEqual(data.resourceType, PColumnDataJsonPartitioned)) {
    const meta = resourceData as PColumnDataPartitionedResourceValue;

    const parts = Object.fromEntries(
      data
        .listInputFields()
        .map((field) => [field, data.traverse({ field, errorIfFieldNotSet: true }).resourceInfo])
    );

    return {
      type: 'JsonPartitioned',
      partitionKeyLength: meta.partitionKeyLength,
      parts
    };
  } else if (resourceTypesEqual(data.resourceType, PColumnDataJsonSuperPartitioned)) {
    const meta = resourceData as PColumnDataSuperPartitionedResourceValue;

    const parts: Record<string, ResourceInfo> = {};
    for (const superKey of data.listInputFields()) {
      const superPart = data.traverse({ field: superKey, errorIfFieldNotSet: true });
      const keys = superPart.listInputFields();
      if (keys === undefined) throw new Error(`no partition keys for super key ${superKey}`);

      for (const key of keys) {
        const partKey = JSON.stringify([...JSON.parse(superKey), ...JSON.parse(key)]);
        parts[partKey] = superPart.traverse({ field: key, errorIfFieldNotSet: true }).resourceInfo;
      }
    }

    return {
      type: 'JsonPartitioned',
      partitionKeyLength: meta.superPartitionKeyLength + meta.partitionKeyLength,
      parts
    };
  } else if (resourceTypesEqual(data.resourceType, PColumnDataBinaryPartitioned)) {
    const meta = resourceData as PColumnDataPartitionedResourceValue;

    const parts: Record<
      string,
      Partial<Writable<PFrameInternal.BinaryChunkInfo<ResourceInfo>>>
    > = {};

    // parsing the structure
    for (const field of data.listInputFields()) {
      if (field.endsWith('.index')) {
        const partKey = field.slice(0, field.length - 6);
        let part = parts[partKey];
        if (part === undefined) {
          part = {};
          parts[partKey] = part;
        }
        part.index = data.traverse({ field, errorIfFieldNotSet: true }).resourceInfo;
      } else if (field.endsWith('.values')) {
        const partKey = field.slice(0, field.length - 7);
        let part = parts[partKey];
        if (part === undefined) {
          part = {};
          parts[partKey] = part;
        }
        part.values = data.traverse({ field, errorIfFieldNotSet: true }).resourceInfo;
      } else throw new Error(`unrecognized part field name: ${field}`);
    }

    // structure validation
    for (const [key, part] of Object.entries(parts)) {
      if (part.index === undefined) throw new Error(`no index for part ${key}`);
      if (part.values === undefined) throw new Error(`no values for part ${key}`);
    }

    return {
      type: 'BinaryPartitioned',
      partitionKeyLength: meta.partitionKeyLength,
      parts: parts as Record<string, PFrameInternal.BinaryChunkInfo<ResourceInfo>>
    };
  } else if (resourceTypesEqual(data.resourceType, PColumnDataBinarySuperPartitioned)) {
    const meta = resourceData as PColumnDataSuperPartitionedResourceValue;

    const parts: Record<
      string,
      Partial<Writable<PFrameInternal.BinaryChunkInfo<ResourceInfo>>>
    > = {};
    for (const superKey of data.listInputFields()) {
      const superData = data.traverse({ field: superKey, errorIfFieldNotSet: true });
      const keys = superData.listInputFields();
      if (keys === undefined) throw new Error(`no partition keys for super key ${superKey}`);

      for (const field of keys) {
        if (field.endsWith('.index')) {
          const key = field.slice(0, field.length - 6);

          const partKey = JSON.stringify([...JSON.parse(superKey), ...JSON.parse(key)]);
          let part = parts[partKey];
          if (part === undefined) {
            part = {};
            parts[partKey] = part;
          }
          parts[partKey].index = superData.traverse({
            field,
            errorIfFieldNotSet: true
          }).resourceInfo;
        } else if (field.endsWith('.values')) {
          const key = field.slice(0, field.length - 7);

          const partKey = JSON.stringify([...JSON.parse(superKey), ...JSON.parse(key)]);
          let part = parts[partKey];
          if (part === undefined) {
            part = {};
            parts[partKey] = part;
          }
          parts[partKey].values = superData.traverse({
            field,
            errorIfFieldNotSet: true
          }).resourceInfo;
        } else throw new Error(`unrecognized part field name: ${field}`);
      }
    }

    return {
      type: 'BinaryPartitioned',
      partitionKeyLength: meta.superPartitionKeyLength + meta.partitionKeyLength,
      parts: parts as Record<string, PFrameInternal.BinaryChunkInfo<ResourceInfo>>
    };
  }

  throw new Error(`unsupported resource type: ${resourceTypeToString(data.resourceType)}`);
}

export function makeDataInfoResource(
  spec: PColumnSpec,
  data: PColumnValues
): PFrameInternal.DataInfo<ResourceInfo> {
  const keyLength = spec.axesSpec.length;
  const jsonData: Record<string, PFrameInternal.JsonDataValue> = {};
  for (const { key, val } of data) {
    if (key.length !== keyLength)
      throw new Error(`inline column key length ${key.length} differs from axes count ${keyLength}`);
    jsonData[JSON.stringify(key)] = val;
  }
  
  return {
    type: 'Json',
    keyLength,
    data: jsonData
  };
}

export function deriveGlobalPObjectId(blockId: string, exportName: string): PObjectId {
  return canonicalize({ __isRef: true, blockId, name: exportName } satisfies PlRef)! as PObjectId;
}

export function deriveLocalPObjectId(outputName: string): PObjectId {
  return outputName as PObjectId;
}
