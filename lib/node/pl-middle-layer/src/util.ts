import { AnyRef, field, FieldType, PlTransaction, ResourceRef, ResourceType } from '@milaboratory/pl-ts-client-v2';

export const EphStdMap: ResourceType = { name: 'EphStdMap', version: '1' };
export const StdMap: ResourceType = { name: 'StdMap', version: '1' };

export function notEmpty<T>(v: T | null | undefined, message?: string): T {
  if (v === null || v === undefined) {
    throw Error(message ?? 'Variable is not defined');
  }

  return v;
}

export function assertNever(x: never): never {
  throw new Error('Unexpected object: ' + x);
}
