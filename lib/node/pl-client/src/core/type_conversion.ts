import {
  Field,
  Field_ValueStatus,
  Resource,
  Resource_Kind
} from '../proto/github.com/milaboratory/pl/plapi/plapiproto/api_types';
import { FieldType as GrpcFieldType } from '../proto/github.com/milaboratory/pl/plapi/plapiproto/base_types';
import {
  FieldData,
  FieldStatus,
  NullResourceId,
  OptionalResourceId,
  FieldType,
  ResourceData,
  ResourceId,
  ResourceKind
} from './types';
import { assertNever, notEmpty } from '@milaboratories/ts-helpers';
import { throwPlNotFoundError } from './errors';

const ResourceErrorField = 'resourceError';

function resourceIsDeleted(proto: Resource): boolean {
  return proto.deletedTime !== undefined && proto.deletedTime.seconds !== 0n;
}

/** Throws "native" pl not found error, if resource is marked as deleted. */
export function protoToResource(proto: Resource): ResourceData {
  if (resourceIsDeleted(proto)) throwPlNotFoundError('resource deleted');
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
    final: proto.isFinal,
    fields: proto.fields?.filter((f) => f.id!.fieldName !== ResourceErrorField).map(protoToField)
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
  const f = proto.fields.find((f) => f?.id?.fieldName === ResourceErrorField);
  return (f?.error ?? NullResourceId) as OptionalResourceId;
}

export function protoToField(proto: Field): FieldData {
  return {
    name: notEmpty(proto.id?.fieldName),
    type: protoToFieldType(proto.type),
    status: protoToFieldStatus(proto.valueStatus),
    value: proto.value as OptionalResourceId,
    error: proto.error as OptionalResourceId,
    valueIsFinal: proto.valueIsFinal
  };
}

function protoToFieldType(proto: GrpcFieldType): FieldType {
  switch (proto) {
    case GrpcFieldType.INPUT:
      return 'Input';
    case GrpcFieldType.OUTPUT:
      return 'Output';
    case GrpcFieldType.SERVICE:
      return 'Service';
    case GrpcFieldType.ONE_TIME_WRITABLE:
      return 'OTW';
    case GrpcFieldType.DYNAMIC:
      return 'Dynamic';
    case GrpcFieldType.MULTIPLE_TIMES_WRITABLE:
      return 'MTW';
    default:
      throw new Error('invalid FieldType: ' + proto);
  }
}

function protoToFieldStatus(proto: Field_ValueStatus): FieldStatus {
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

export function fieldTypeToProto(type: FieldType): GrpcFieldType {
  switch (type) {
    case 'Input':
      return GrpcFieldType.INPUT;
    case 'Output':
      return GrpcFieldType.OUTPUT;
    case 'Dynamic':
      return GrpcFieldType.DYNAMIC;
    case 'Service':
      return GrpcFieldType.SERVICE;
    case 'MTW':
      return GrpcFieldType.MULTIPLE_TIMES_WRITABLE;
    case 'OTW':
      return GrpcFieldType.ONE_TIME_WRITABLE;
    default:
      return assertNever(type);
  }
}
