/*
Questions to Denis or Gleb:
- Difference between Dynamic and MTW fields?
*/

import {
  Field,
  Field_ValueStatus,
  Resource,
  Resource_Kind
} from './proto/github.com/milaboratory/pl/plapi/plapiproto/api_types';
import { notEmpty } from './util/util';
import { FieldType } from './proto/github.com/milaboratory/pl/plapi/plapiproto/base_types';

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

export type ResourceKind = 'Structural' | 'Value';

export type PlFieldType =
  | 'Input'
  | 'Output'
  | 'Service'
  | 'OTW'
  | 'Dynamic'
  | 'MTW';

export type PlFieldStatus = 'Empty' | 'Assigned' | 'Resolved';

export interface PlResourceType {
  readonly name: string;
  readonly version: string;
}

/** Readonly fields here marks properties of resource that can't change according to pl's state machine. */
export interface PlBasicResourceData {
  readonly id: ResourceId;
  originalResourceId: OptionalResourceId;

  readonly kind: ResourceKind;
  readonly type: PlResourceType;

  readonly data?: Uint8Array;

  error: OptionalResourceId;

  inputsLocked: boolean;
  outputsLocked: boolean;
  resourceReady: boolean;
}

export interface PlResourceData extends PlBasicResourceData {
  fields: PlFieldData[];
}

export interface PlFieldData {
  name: string;
  type: PlFieldType;
  status: PlFieldStatus;
  value: OptionalResourceId;
  error: OptionalResourceId;
}

export function protoToResource(proto: Resource): PlResourceData {
  return {
    id: proto.id as ResourceId,
    originalResourceId: proto.originalResourceId as OptionalResourceId,
    type: notEmpty(proto.type),
    data: proto.data,
    inputsLocked: proto.inputsLocked,
    outputsLocked: proto.outputsLocked,
    resourceReady: proto.resourceReady,
    kind: protoToResourceKind(proto.kind),
    error: protoToError(proto),
    fields: proto.fields?.map(protoToField)
  };
}

function protoToResourceKind(proto: Resource_Kind): ResourceKind {
  switch (proto) {
    case Resource_Kind.STRUCTURAL:
      return 'Structural';
    case Resource_Kind.VALUE:
      return 'Value';
  }

  throw new Error('invalid ResourceKind: ' + proto);
}

function protoToError(proto: Resource): OptionalResourceId {
  const f = proto.fields.find((f) => f?.id?.fieldName === 'resourceError');
  return (f?.error ?? NullResourceId) as OptionalResourceId;
}

function protoToField(proto: Field): PlFieldData {
  return {
    name: notEmpty(proto.id?.fieldName),
    type: protoToFieldType(proto.type),
    status: protoToFieldStatus(proto.valueStatus),
    value: proto.value as OptionalResourceId,
    error: proto.error as OptionalResourceId
  };
}

function protoToFieldType(proto: FieldType): PlFieldType {
  switch (proto) {
    case FieldType.INPUT:
      return 'Input';
    case FieldType.OUTPUT:
      return 'Output';
    case FieldType.SERVICE:
      return 'Service';
    case FieldType.ONE_TIME_WRITABLE:
      return 'OTW';
    case FieldType.DYNAMIC:
      return 'Dynamic';
    case FieldType.MULTIPLE_TIMES_WRITABLE:
      return 'MTW';
    default:
      throw new Error('invalid FieldType: ' + proto);
  }
}

function protoToFieldStatus(proto: Field_ValueStatus): PlFieldStatus {
  switch (proto) {
    case Field_ValueStatus.EMPTY:
      return 'Empty';
    case Field_ValueStatus.ASSIGNED:
      return 'Assigned';
    case Field_ValueStatus.RESOLVED:
      return 'Resolved';
    default:
      throw new Error('invalid FieldStatus: ' + proto);
  }
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
