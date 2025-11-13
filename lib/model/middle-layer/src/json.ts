import {
  canonicalizeJson,
  parseJson,
  type JsonCompatible,
  type JsonSerializable,
  type StringifiedJson,
} from '@milaboratories/pl-model-common';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

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

export async function readJson<T extends JsonSerializable>(filePath: string, signal?: AbortSignal): Promise<T> {
  const content = await fs.promises.readFile(filePath, { encoding: 'utf8', signal });
  return parseJson(content as StringifiedJson<T>);
}

export function readJsonSync<T extends JsonSerializable>(filePath: string): T {
  const content = fs.readFileSync(filePath, { encoding: 'utf8' });
  return parseJson(content as StringifiedJson<T>);
}
