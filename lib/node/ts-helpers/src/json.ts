import {
  canonicalizeJson,
  type JsonCompatible,
  type JsonSerializable,
} from '@milaboratories/pl-model-common';
import { createHash } from 'node:crypto';

export type HashedJson<T = unknown> = JsonCompatible<T> extends never ? never : string & {
  __json_hashed: T;
};

export function hashJson<T>(value: JsonCompatible<T>): HashedJson<T>;
export function hashJson<T extends JsonSerializable>(value: T): string;
export function hashJson(value: unknown): string {
  const hash = createHash('sha256');
  hash.update(canonicalizeJson(value));
  return hash.digest().toString('hex');
}
