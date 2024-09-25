/**
 * @packageDocumentation
 *
 * This file is exported under Pl "namespace" to the client users.
 *
 * It defines well known pl types, and methods to manipulate them.
 *
 */

import type { FutureFieldType, ResourceType } from '../core/types';
import type { AnyRef, FieldRef, PlTransaction, ResourceRef } from '../core/transaction';
import { field } from '../core/transaction';

function rt(name: string, version: string): ResourceType {
  return { name, version };
}

export const ClientRoot = rt('ClientRoot', '1');

export const StructTestResource = rt('StructTest', '1');
export const ValueTestResource = rt('ValueTest', '1');

export const JsonString = rt('json/string', '1');
export const JsonBool = rt('json/bool', '1');
export const JsonObject = rt('json/object', '1');
export const JsonArray = rt('json/array', '1');
export const JsonNumber = rt('json/number', '1');
export const JsonNull = rt('json/null', '1');

export const EphStdMap: ResourceType = rt('EphStdMap', '1');
export const StdMap: ResourceType = rt('StdMap', '1');

//
// Standard value resources
//

export function createPlNull(tx: PlTransaction): ResourceRef {
  return tx.createValue(JsonNull, Buffer.from(JSON.stringify(null)));
}

export function createPlBool(tx: PlTransaction, val: boolean): ResourceRef {
  return tx.createValue(JsonBool, Buffer.from(JSON.stringify(val)));
}

export function createPlNumber(tx: PlTransaction, val: number): ResourceRef {
  return tx.createValue(JsonNumber, Buffer.from(JSON.stringify(val)));
}

export function createPlString(tx: PlTransaction, val: string): ResourceRef {
  return tx.createValue(JsonString, Buffer.from(JSON.stringify(val)));
}

export function createPlArray(tx: PlTransaction, val: any[]): ResourceRef {
  return tx.createValue(JsonArray, Buffer.from(JSON.stringify(val)));
}

export function createPlObject(tx: PlTransaction, val: object): ResourceRef {
  return tx.createValue(JsonObject, Buffer.from(JSON.stringify(val)));
}

//
// Pl Map
//

export type PlRecordEntry<Key extends string = string, Ref extends AnyRef = AnyRef> = [Key, Ref];

export type PlRecord<Key extends string = string, Ref extends AnyRef = AnyRef> = Record<Key, Ref>;

export function plEntry<Key extends string = string, Ref extends AnyRef = AnyRef>(
  key: Key,
  ref: Ref
): PlRecordEntry<Key, Ref> {
  return [key, ref];
}

export function plEntries<Key extends string = string, Ref extends AnyRef = AnyRef>(
  record: PlRecord<Key, Ref>,
  fields?: Key[]
): PlRecordEntry<Key, Ref>[] {
  return fields === undefined
    ? (Object.entries(record) as PlRecordEntry<Key, Ref>[])
    : fields.map((key) => plEntry(key, record[key]));
}

/** Helper method to build standard pl map from a set of entries */
export function createPlMap(
  tx: PlTransaction,
  entries: PlRecordEntry[] | PlRecord,
  ephemeral: boolean,
  type?: ResourceType
): ResourceRef {
  const actualType = type ?? (ephemeral ? EphStdMap : StdMap);
  const rId = ephemeral ? tx.createEphemeral(actualType) : tx.createStruct(actualType);

  for (const [name, value] of Array.isArray(entries) ? entries : plEntries(entries))
    tx.createField(field(rId, name), 'Input', value);

  tx.lock(rId);

  return rId;
}

export function futureRecord<Key extends string>(
  tx: PlTransaction,
  rId: AnyRef,
  keys: Key[],
  fieldType: FutureFieldType,
  prefix: string = ''
): PlRecord<Key, FieldRef> {
  return Object.fromEntries(
    keys.map((k) => plEntry(k, tx.getFutureFieldValue(rId, `${prefix}${k}`, fieldType)))
  ) as PlRecord<Key, FieldRef>;
}

//
// Holder
//

/** Name of the field in block holder, that references the actual block-pack. */
export const Holder = StdMap;
export const EphHolder = EphStdMap;
export const HolderRefField = 'ref';

export function wrapInHolder(tx: PlTransaction, ref: AnyRef): ResourceRef {
  const holder = tx.createStruct(Holder);
  const mainHolderField = field(holder, HolderRefField);
  tx.createField(mainHolderField, 'Input', ref);
  tx.lock(holder);
  return holder;
}

export function wrapInEphHolder(tx: PlTransaction, ref: AnyRef): ResourceRef {
  const holder = tx.createEphemeral(EphHolder);
  const mainHolderField = field(holder, HolderRefField);
  tx.createField(mainHolderField, 'Input', ref);
  tx.lock(holder);
  return holder;
}

export function unwrapHolder(tx: PlTransaction, ref: AnyRef): FieldRef {
  return tx.getFutureFieldValue(ref, HolderRefField, 'Input');
}
