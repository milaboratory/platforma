import type {
  BasicResourceData,
  FieldData,
  FieldType,
  OptionalSignedResourceId,
  ResourceType,
} from "@milaboratories/pl-client";
import {
  NullSignedResourceId,
  createSignedResourceId,
  isNotNullSignedResourceId,
} from "@milaboratories/pl-client";
import type { ExtendedResourceData } from "./state";

export const TestRootType1: ResourceType = {
  name: "TestRootResource1",
  version: "0",
};

export const TestRootType2: ResourceType = {
  name: "TestRootResource2",
  version: "0",
};

export const TestStructuralResourceType1: ResourceType = {
  name: "TestStructuralResource1",
  version: "0",
};

export const TestStructuralResourceType2: ResourceType = {
  name: "TestStructuralResource2",
  version: "0",
};

export const TestValueResourceType1: ResourceType = {
  name: "TestValueResource1",
  version: "0",
};

export const TestValueResourceType2: ResourceType = {
  name: "TestValueResource2",
  version: "0",
};

export const TestErrorResourceType1: ResourceType = {
  name: "json/resourceError",
  version: "1",
};

export const ResourceReady: Pick<
  BasicResourceData,
  "inputsLocked" | "outputsLocked" | "resourceReady" | "final"
> = {
  inputsLocked: true,
  outputsLocked: true,
  resourceReady: true,
  final: true,
};

export const InitialStructuralResourceState: Omit<ExtendedResourceData, "id" | "type" | "fields"> =
  {
    kind: "Structural",
    originalResourceId: NullSignedResourceId,
    error: NullSignedResourceId,
    inputsLocked: false,
    outputsLocked: false,
    resourceReady: false,
    final: false,
    kv: [],
  };

export const InitialValueResourceState: Omit<ExtendedResourceData, "id" | "type" | "data"> = {
  kind: "Value",
  originalResourceId: NullSignedResourceId,
  error: NullSignedResourceId,
  ...ResourceReady,
  fields: [],
  kv: [],
};

export const TestStructuralResourceState1: Omit<ExtendedResourceData, "id" | "fields"> = {
  ...InitialStructuralResourceState,
  type: TestStructuralResourceType1,
};

export const TestStructuralResourceState2: Omit<ExtendedResourceData, "id" | "fields"> = {
  ...InitialStructuralResourceState,
  type: TestStructuralResourceType2,
};

export const TestValueResourceState1: Omit<ExtendedResourceData, "id" | "data"> = {
  ...InitialValueResourceState,
  type: TestValueResourceType1,
};

export const TestValueResourceState2: Omit<ExtendedResourceData, "id" | "data"> = {
  ...InitialValueResourceState,
  type: TestValueResourceType2,
};

export const TestErrorResourceState2: Omit<ExtendedResourceData, "id" | "data"> = {
  ...InitialValueResourceState,
  type: TestErrorResourceType1,
};

export const TestDynamicRootId1 = createSignedResourceId(1000001n);
export const TestDynamicRootState1: Omit<ExtendedResourceData, "fields"> = {
  ...InitialStructuralResourceState,
  inputsLocked: true,
  outputsLocked: true,
  resourceReady: true,
  type: TestRootType1,
  id: TestDynamicRootId1,
};

export const TestDynamicRootId2 = createSignedResourceId(1000002n);
export const TestDynamicRootState2: Omit<ExtendedResourceData, "fields"> = {
  ...InitialStructuralResourceState,
  inputsLocked: true,
  outputsLocked: true,
  resourceReady: true,
  type: TestRootType2,
  id: TestDynamicRootId2,
};

export function field(
  type: FieldType,
  name: string,
  value: OptionalSignedResourceId = NullSignedResourceId,
  error: OptionalSignedResourceId = NullSignedResourceId,
  valueIsFinal: boolean = false,
): FieldData {
  return {
    name,
    type,
    value,
    error,
    status: isNotNullSignedResourceId(value)
      ? "Resolved"
      : isNotNullSignedResourceId(error)
        ? "Assigned"
        : "Empty",
    valueIsFinal,
  };
}

export function dField(
  name: string,
  value: OptionalSignedResourceId = NullSignedResourceId,
  error: OptionalSignedResourceId = NullSignedResourceId,
): FieldData {
  return field("Dynamic", name, value, error);
}

export function iField(
  name: string,
  value: OptionalSignedResourceId = NullSignedResourceId,
  error: OptionalSignedResourceId = NullSignedResourceId,
): FieldData {
  return field("Input", name, value, error);
}
