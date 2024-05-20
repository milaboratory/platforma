import { Optional } from 'utility-types';
import {
  BasicResourceData, FieldData,
  FieldType,
  NullResourceId, OptionalResourceId,
  ResourceData,
  ResourceId,
  ResourceType
} from '@milaboratory/pl-client-v2';

export const TestRootType1: ResourceType = {
  name: 'TestRootResource1',
  version: '0'
};

export const TestRootType2: ResourceType = {
  name: 'TestRootResource2',
  version: '0'
};

export const TestStructuralResourceType1: ResourceType = {
  name: 'TestStructuralResource1',
  version: '0'
};

export const TestStructuralResourceType2: ResourceType = {
  name: 'TestStructuralResource2',
  version: '0'
};

export const TestValueResourceType1: ResourceType = {
  name: 'TestValueResource1',
  version: '0'
};

export const TestValueResourceType2: ResourceType = {
  name: 'TestValueResource2',
  version: '0'
};

export const ResourceReady: Pick<
  BasicResourceData,
  'inputsLocked' | 'outputsLocked' | 'resourceReady'
> = {
  inputsLocked: true,
  outputsLocked: true,
  resourceReady: true
};

export const InitialStructuralResourceState: Optional<
  BasicResourceData,
  'id' | 'type'
> = {
  kind: 'Structural',
  originalResourceId: NullResourceId,
  error: NullResourceId,
  inputsLocked: false,
  outputsLocked: false,
  resourceReady: false
};

export const InitialValueResourceState: Optional<
  ResourceData,
  'id' | 'type'
> = {
  kind: 'Value',
  originalResourceId: NullResourceId,
  error: NullResourceId,
  ...ResourceReady,
  data: new Uint8Array(0),
  fields: []
};

export const TestStructuralResourceState1: Optional<BasicResourceData, 'id'> =
  {
    ...InitialStructuralResourceState,
    type: TestStructuralResourceType1
  };

export const TestStructuralResourceState2: Optional<BasicResourceData, 'id'> =
  {
    ...InitialStructuralResourceState,
    type: TestStructuralResourceType2
  };

export const TestValueResourceState1: Optional<ResourceData, 'id' | 'data'> =
  {
    ...InitialValueResourceState,
    type: TestValueResourceType1
  };

export const TestValueResourceState2: Optional<ResourceData, 'id' | 'data'> =
  {
    ...InitialValueResourceState,
    type: TestValueResourceType2
  };

export const TestDynamicRootId1 = 1000001n as ResourceId;
export const TestDynamicRootState1: BasicResourceData = {
  ...InitialStructuralResourceState,
  inputsLocked: true,
  outputsLocked: true,
  resourceReady: true,
  type: TestRootType1,
  id: TestDynamicRootId1
};

export const TestDynamicRootId2 = 1000002n as ResourceId;
export const TestDynamicRootState2: BasicResourceData = {
  ...InitialStructuralResourceState,
  inputsLocked: true,
  outputsLocked: true,
  resourceReady: true,
  type: TestRootType2,
  id: TestDynamicRootId2
};

export function field(
  type: FieldType,
  name: string,
  value: OptionalResourceId = NullResourceId,
  error: OptionalResourceId = NullResourceId
): FieldData {
  return {
    name,
    type,
    value,
    error,
    status:
      value !== NullResourceId
        ? 'Resolved'
        : error !== NullResourceId
          ? 'Assigned'
          : 'Empty'
  };
}

export function dField(
  name: string,
  value: OptionalResourceId = NullResourceId,
  error: OptionalResourceId = NullResourceId
): FieldData {
  return field('Dynamic', name, value, error);
}

export function iField(
  name: string,
  value: OptionalResourceId = NullResourceId,
  error: OptionalResourceId = NullResourceId
): FieldData {
  return field('Input', name, value, error);
}

export interface ValueAndError<T> {
  value?: T;
  error?: T;
}

export function mapValueAndErrorIfDefined<T1, T2>(
  input: ValueAndError<T1> | undefined,
  mapping: (v: T1) => T2
): ValueAndError<T2> | undefined {
  if (input === undefined) return undefined;
  else return mapValueAndError(input, mapping);
}

export function mapValueAndError<T1, T2>(
  input: ValueAndError<T1>,
  mapping: (v: T1) => T2
) {
  const ret = {} as ValueAndError<T2>;
  if (input.value !== undefined) ret.value = mapping(input.value);
  if (input.error !== undefined) ret.error = mapping(input.error);
  return ret;
}
