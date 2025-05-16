import * as upath from 'upath';
import { CachedFileRange } from './range_blobs_cache';
import { CallersCounter } from '@milaboratories/ts-helpers';
import { type RangeBytes } from '@milaboratories/pl-model-common';

export const PL_STORAGE_TO_PATH = process.env.PL_STORAGE_TO_PATH
  ? Object.fromEntries(process.env.PL_STORAGE_TO_PATH.split(';').map((kv) => kv.split(':')))
  : {};

/** Functions-generators for tests.*/

export const genWholeFile = (dir: string, baseKey: string, size: number, counter?: number): CachedFileRange => {
  const c = new CallersCounter();
  for (let i = 0; i < (counter ?? 0); i++) {
    c.inc(`caller${i}`);
  }

  return {
    range: { from: 0, to: size },
    path: upath.join(dir, baseKey + '.txt'),
    baseKey,
    key: baseKey,
    counter: c,
  };
};

export const genRangeFile = (dir: string, baseKey: string, range: RangeBytes, counter?: number): CachedFileRange => {
  const key = `${baseKey}_${range.from}-${range.to}`;

  const c = new CallersCounter();
  for (let i = 0; i < (counter ?? 0); i++) {
    c.inc(`caller${i}`);
  }

  return {
    path: upath.join(dir, key + '.txt'),
    baseKey,
    key,
    range,
    counter: c,
  };
};

