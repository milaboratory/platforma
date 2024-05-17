/*
Questions to Denis or Gleb:
- Difference between Dynamic and MTW fields?
*/

import { notEmpty } from "./util/util";

// more details here: https://egghead.io/blog/using-branded-types-in-typescript
declare const __resource_id_type__: unique symbol;
type BrandResourceId<B> = bigint & { [__resource_id_type__]: B }

/** Global resource id */
export type ResourceId = BrandResourceId<'global'>;

/** Null resource id */
export type NullResourceId = BrandResourceId<'null'>;

/** Local resource id */
export type LocalResourceId = BrandResourceId<'local'>;

/** Any non-null resource id */
export type AnyResourceId = ResourceId | LocalResourceId;

/** Any resource id */
export type OptionalResourceId = NullResourceId | ResourceId;

/** All possible resource flavours */
export type OptionalAnyResourceId = NullResourceId | ResourceId | LocalResourceId;

export const NullResourceId = 0n as NullResourceId;

export function isNullResourceId(resourceId: OptionalAnyResourceId): resourceId is NullResourceId {
  return resourceId === NullResourceId;
}

export function isNotNullResourceId(resourceId: OptionalResourceId): resourceId is ResourceId {
  return resourceId !== NullResourceId;
}

export function ensureResourceIdNotNull(resourceId: OptionalResourceId): ResourceId {
  if (!isNotNullResourceId(resourceId))
    throw new Error('null resource id');
  return resourceId;
}

export function isAnyResourceId(resourceId: bigint): resourceId is AnyResourceId {
  return resourceId !== 0n;
}


// see local / global resource logic below...

export type ResourceKind =
  | 'Structural'
  | 'Value';

export type FieldType =
  | 'Input'
  | 'Output'
  | 'Service'
  | 'OTW'
  | 'Dynamic'
  | 'MTW';

export type FutureFieldType =
  | 'Output'
  | 'Input'
  | 'Service'

export type FieldStatus =
  | 'Empty'
  | 'Assigned'
  | 'Resolved';

export interface ResourceType {
  readonly name: string;
  readonly version: string;
}

/** Readonly fields here marks properties of resource that can't change according to pl's state machine. */
export interface BasicResourceData {
  readonly id: ResourceId;
  originalResourceId: OptionalResourceId;

  readonly kind: ResourceKind;
  readonly type: ResourceType;

  readonly data?: Uint8Array;

  error: OptionalResourceId;

  inputsLocked: boolean;
  outputsLocked: boolean;
  resourceReady: boolean;
}

export interface ResourceData extends BasicResourceData {
  fields: FieldData[];
}

export function getField(r: ResourceData, name: string): FieldData {
  return notEmpty(r.fields.filter(f => f.name == name).at(0));
}

export interface FieldData {
  name: string;
  type: FieldType;
  status: FieldStatus;
  value: OptionalResourceId;
  error: OptionalResourceId;
}

//
// Local / Global ResourceId arithmetics
//

// Note: txId and other numerical values are made numbers but not bigint intentionally,
//       after implementing security model based on signed resource ids this will make
//       much more sense

const ResourceIdRootMask = 1n << 63n;
const ResourceIdLocalMask = 1n << 62n;
const NoFlagsIdMask = 0x3FFFFFFFFFFFFFFFn;
const LocalResourceIdTxIdOffset = 24n;
export const MaxLocalId = 0xFFFFFF;
export const MaxTxId = 0xFFFFFFFF;
/** Mask valid after applying shift */
const TxIdMask = BigInt(MaxTxId);
const LocalIdMask = BigInt(MaxLocalId);

// /** Basically removes embedded tx id */
// const LocalIdCleanMask = 0xFF00000000FFFFFFn;

export function isRootResourceId(id: AnyResourceId) {
  return (id & ResourceIdRootMask) !== 0n;
}

export function isLocalResourceId(id: AnyResourceId): id is LocalResourceId {
  return (id & ResourceIdLocalMask) !== 0n;
}

export function createLocalResourceId(isRoot: boolean, localCounterValue: number, localTxId: number): LocalResourceId {
  if (localCounterValue > MaxLocalId || localTxId > MaxTxId || localCounterValue < 0 || localTxId <= 0)
    throw Error('wrong local id or tx id');
  return ((isRoot ? ResourceIdRootMask : 0n)
    | ResourceIdLocalMask
    | BigInt(localCounterValue)
    | (BigInt(localTxId) << LocalResourceIdTxIdOffset)) as LocalResourceId;
}

export function extractTxId(localResourceId: LocalResourceId): number {
  return Number((localResourceId >> LocalResourceIdTxIdOffset) & TxIdMask);
}

export function checkLocalityOfResourceId(
  resourceId: AnyResourceId,
  expectedTxId: number
): void {
  if (!isLocalResourceId(resourceId))
    return;
  if (extractTxId(resourceId) !== expectedTxId)
    throw Error('local id from another transaction, globalize id before leaking it from the transaction');
}

export function resourceIdToString(resourceId: OptionalAnyResourceId): string {
  if (isNullResourceId(resourceId))
    return 'null-id';
  if (isLocalResourceId(resourceId))
    return (isRootResourceId(resourceId) ? 'R' : 'N') + 'L:' +
      (LocalIdMask & resourceId).toString(16) +
      ' [' + extractTxId(resourceId).toString(16) + ']';
  else
    return (isRootResourceId(resourceId) ? 'R' : 'N') +
      'G:' + (NoFlagsIdMask & resourceId).toString(16);
}

export function stringifyWithResourceId(object: unknown | undefined): string {
  return JSON.stringify(object, (key, value) =>
    typeof value === 'bigint' ? resourceIdToString(value as OptionalAnyResourceId) : value
  );
}
