import { PColumn, PColumnSpec, PObject, PObjectId, PObjectSpec } from '@milaboratory/sdk-ui';
import { PFrameInternal } from '@milaboratory/pl-middle-layer-model';
import { PlTreeNodeAccessor, ResourceInfo } from '@milaboratory/pl-tree';
import { assertNever } from '@milaboratory/ts-helpers';
import { createHash } from 'crypto';
import canonicalize from 'canonicalize';
import {
  isNullResourceId,
  resourceType,
  resourceTypeToString,
  resourceTypesEqual
} from '@milaboratory/pl-client-v2';
import { Writable } from 'utility-types';

export function* allBlobs<B>(data: PFrameInternal.DataInfo<B>): Generator<B> {
  switch (data.type) {
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
export const PColumnDataBinaryPartitioned = resourceType('PColumnData/BinaryPartitioned', '1');
export type PColumnDataResourceValue = {
  partitionKeyLength: number;
};

export function parseDataInfoResource(
  data: PlTreeNodeAccessor
): PFrameInternal.DataInfo<ResourceInfo> {
  if (!data.getIsReadyOrError()) throw new Error('Data not ready.');

  const meta = data.getDataAsJson<PColumnDataResourceValue>();
  if (meta === undefined) throw new Error('unexpected data info structure, no resource value');

  if (resourceTypesEqual(data.resourceType, PColumnDataJsonPartitioned)) {
    const parts = Object.fromEntries(
      data
        .listInputFields()
        .map((field) => [
          field,
          data.traverse({ field, errorIfFieldNotSet: true }).resourceInfo
        ])
    );

    return {
      type: 'JsonPartitioned',
      partitionKeyLength: meta.partitionKeyLength,
      parts
    };
  } else if (resourceTypesEqual(data.resourceType, PColumnDataBinaryPartitioned)) {
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
  }

  throw new Error(`unsupported resource type: ${resourceTypeToString(data.resourceType)}`);
}

export function derivePObjectId(spec: PObjectSpec, data: PlTreeNodeAccessor): PObjectId {
  const hash = createHash('sha256');
  hash.update(canonicalize(spec)!);
  hash.update(String(isNullResourceId(data.originalId) ? data.id : data.originalId));
  return hash.digest().toString('hex') as PObjectId;
}

export function makePObject(
  spec: PObjectSpec,
  data: PlTreeNodeAccessor
): PObject<PlTreeNodeAccessor> {
  return {
    id: derivePObjectId(spec, data),
    spec,
    data
  };
}
