import { PColumnSpec, PObjectId, PObjectSpec } from '@milaboratory/sdk-ui';
import { PFrameInternal } from '@milaboratory/pl-middle-layer-model';
import { PlTreeNodeAccessor, ResourceInfo } from '@milaboratory/pl-tree';
import { assertNever } from '@milaboratory/ts-helpers';
import { createHash } from 'crypto';
import canonicalize from 'canonicalize';
import { isNullResourceId, resourceType, resourceTypesEqual } from '@milaboratory/pl-client-v2';
import { ComputableCtx } from '@milaboratory/computable';

export type PColumn = {
  spec: PColumnSpec;
  data: PFrameInternal.DataInfo<ResourceInfo>;
};

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

export type PFrameData = Map<PObjectId, PColumn>;

export const PColumnDataJsonPartitioned = resourceType('PColumnData/JsonPartitioned', '1');
export const PColumnDataBinaryPartitioned = resourceType('PColumnData/BinaryPartitioned', '1');
export type PColumnDataResourceValue = {
  partitionKeyLength: number;
};

// TODO <----
// export function createDataInfo(
//   ctx: ComputableCtx,
//   data: PlTreeNodeAccessor
// ): PFrameInternal.DataInfo<ResourceInfo> {
//   if (!data.getIsFinal()) throw new Error('Data not ready.');
//   if (resourceTypesEqual(data.resourceType, PColumnDataJsonPartitioned)) {
//     const meta = data.getDataAsJson<PColumnDataResourceValue>();
//     if (meta === undefined) throw new Error('unexpected data info structure, no resource value');
//     return {
//       type: 'JsonPartitioned',
//       partitionKeyLength: meta?.partitionKeyLength,
//       parts: Object.fromEntries(
//         data
//           .listInputFields()
//           .map((field) => [
//             field,
//             data.traverse({ field, errorIfFieldNotAssigned: true }).resourceInfo
//           ])
//       )
//     };
//   }
// }

export function stableKeyFromPFrameData(data: PFrameData): string {
  // PObject IDs derived from the PObjects canonical identity, so represents the content
  const ids = [...data.keys()].sort();
  const hash = createHash('sha256');
  for (const id of ids) hash.update(id);
  return hash.digest().toString('hex');
}

export function derivePObjectId(spec: PObjectSpec, data: PlTreeNodeAccessor): PObjectId {
  const hash = createHash('sha256');
  hash.update(canonicalize(spec)!);
  hash.update(String(isNullResourceId(data.originalId) ? data.id : data.originalId));
  return hash.digest().toString('hex') as PObjectId;
}
