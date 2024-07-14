import { PColumnSpec } from '@milaboratory/sdk-ui';

import { PFrameInternal } from '@milaboratory/pl-middle-layer-model';
import { ResourceInfo } from '@milaboratory/pl-tree';
import { assertNever } from '@milaboratory/ts-helpers';

export type PColumnData = {
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
