import { Computable } from "@milaboratories/computable";
import type {
  FieldData,
  OptionalSignedResourceId,
  ResourceType,
  SignedResourceId,
} from "@milaboratories/pl-client";
import {
  createSignedResourceId,
  DefaultFinalResourceDataPredicate,
  NullSignedResourceId,
} from "@milaboratories/pl-client";
import type { PColumnSpec, PObjectId } from "@milaboratories/pl-model-common";
import { createLocalPObjectId, ResourceTypeName } from "@milaboratories/pl-model-common";
import type { ExtendedResourceData, PlTreeEntry } from "@milaboratories/pl-tree";
import { isPlTreeNodeAccessor, PlTreeState } from "@milaboratories/pl-tree";
import { describe, expect, it } from "vitest";
import { buildColumnRegistry, resolvePColumnById } from "./column_registry";

describe("resolvePColumnById", () => {
  it("returns the data resource of a column whose data is there", async () => {
    const result = await resolveData(frameTree([inputField("col.data", DataId)]), column);

    expect(result.value).toEqual({ spec, data: "resource" });
    expect(result.stable).toBe(true);
  });

  it("returns no values for a data field that holds an error and no value", async () => {
    const result = await resolveData(
      frameTree([inputField("col.data", NullSignedResourceId, ErrorId)]),
      column,
    );

    expect(result.value).toEqual({ spec, data: [] });
    expect(result.stable).toBe(true);
  });

  it("returns no values for a data field that holds an error and a value", async () => {
    const result = await resolveData(frameTree([inputField("col.data", DataId, ErrorId)]), column);

    expect(result.value).toEqual({ spec, data: [] });
    expect(result.stable).toBe(true);
  });

  it("returns no values for a data field without a value yet, and is not stable", async () => {
    const result = await resolveData(
      frameTree([inputField("col.data", NullSignedResourceId)], {
        resourceReady: false,
        final: false,
      }),
      column,
    );

    expect(result.value).toEqual({ spec, data: [] });
    expect(result.stable).toBe(false);
  });

  it("throws the error of a spec field that holds an error and no value", async () => {
    const entry = frameTree(
      [inputField("col.data", DataId)],
      {},
      inputField("col.spec", NullSignedResourceId, ErrorId),
    );

    await expect(resolveData(entry, column)).rejects.toThrow(/ptabler ran out of memory/);
  });
});

//
// Internals
//

const RootId = createSignedResourceId(1n);
const FrameId = createSignedResourceId(2n);
const SpecId = createSignedResourceId(3n);
const DataId = createSignedResourceId(4n);
const ErrorId = createSignedResourceId(5n);

const spec: PColumnSpec = {
  kind: "PColumn",
  name: "col",
  valueType: "Int",
  axesSpec: [{ name: "id", type: "String" }],
};

const column = createLocalPObjectId(["main", "frame"], "col");

type ResourceState = Partial<
  Pick<ExtendedResourceData, "inputsLocked" | "outputsLocked" | "resourceReady" | "final">
>;

function inputField(
  name: string,
  value: OptionalSignedResourceId,
  error: OptionalSignedResourceId = NullSignedResourceId,
): FieldData {
  return {
    name,
    type: "Input",
    value,
    error,
    status: value === NullSignedResourceId ? "Assigned" : "Resolved",
    valueIsFinal: false,
  };
}

function resource(
  id: SignedResourceId,
  type: ResourceType,
  fields: FieldData[],
  data?: unknown,
  state: ResourceState = {},
): ExtendedResourceData {
  return {
    id,
    type,
    kind: data === undefined ? "Structural" : "Value",
    originalResourceId: NullSignedResourceId,
    canonicalId: new Uint8Array(0),
    error: NullSignedResourceId,
    inputsLocked: true,
    outputsLocked: true,
    resourceReady: true,
    final: true,
    ...state,
    fields,
    kv: [],
    ...(data !== undefined && { data: Buffer.from(JSON.stringify(data)) }),
  };
}

/** The outputs of a block: a map with one result list `frame` holding the column `col`. */
function frameTree(
  dataFields: FieldData[],
  frameState: ResourceState = {},
  specField: FieldData = inputField("col.spec", SpecId),
): PlTreeEntry {
  const tree = new PlTreeState(RootId, DefaultFinalResourceDataPredicate);
  tree.updateFromResourceData([
    resource(RootId, { name: ResourceTypeName.StdMap, version: "1" }, [
      inputField("frame", FrameId),
    ]),
    resource(
      FrameId,
      { name: ResourceTypeName.PFrame, version: "1" },
      [specField, ...dataFields],
      undefined,
      frameState,
    ),
    resource(SpecId, { name: "json/object", version: "1" }, [], spec),
    resource(DataId, { name: "PColumnData/Json", version: "1" }, [], { keyLength: 1, data: {} }),
    resource(ErrorId, { name: "json/resourceError", version: "1" }, [], {
      message: "ptabler ran out of memory",
    }),
  ]);
  return tree.entry();
}

/** The column `id` as a frame is given it; `data` tells a data resource from a value list. */
function resolveData(entry: PlTreeEntry, id: PObjectId) {
  return Computable.make((c) => {
    const registry = buildColumnRegistry({
      outputs: c.accessor(entry).node(),
      upstreamBlockCtxes: [],
    });
    const resolved = resolvePColumnById(registry, id);
    return {
      spec: resolved.spec,
      data: isPlTreeNodeAccessor(resolved.data) ? "resource" : resolved.data,
    };
  }).getFullValue();
}
