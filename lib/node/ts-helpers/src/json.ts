import { canonicalizeJson, type JsonCompatible } from '@milaboratories/pl-model-common';
import { createHash } from 'node:crypto';

export type HashedJson<T = unknown> = JsonCompatible<T> extends never ? never : string & {
  __json_hashed: T;
};

export function hashJson<T>(value: JsonCompatible<T>): HashedJson<T> {
  const hash = createHash('sha256');
  hash.update(canonicalizeJson(value));
  return hash.digest().toString('hex') as HashedJson<T>;
}
