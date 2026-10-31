import { ColumnsCollectionDriverImpl } from "@milaboratories/columns-collection-driver";
import { Computable } from "@milaboratories/computable";
import { SpecDriver } from "@milaboratories/pf-spec-driver";
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
import type {
  AccessorHandle,
  CollectionHandle,
  ColumnsCollectionDriverHost,
  PColumnSpec,
} from "@milaboratories/pl-model-common";
import { createLocalPObjectId, ResourceTypeName } from "@milaboratories/pl-model-common";
import type {
  ExtendedResourceData,
  PlTreeEntry,
  PlTreeNodeAccessor,
} from "@milaboratories/pl-tree";
import { PlTreeState } from "@milaboratories/pl-tree";
import { afterAll, describe, expect, it } from "vitest";
import { buildColumnRegistry, resolveColumnSpec, resolvePColumnById } from "./column_registry";

const RootId = createSignedResourceId(1n);
const FrameId = createSignedResourceId(2n);
const SpecId = createSignedResourceId(3n);
const ErrorId = createSignedResourceId(4n);
const DataId = createSignedResourceId(5n);
const BrokenSpecId = createSignedResourceId(6n);

const spec: PColumnSpec = {
  kind: "PColumn",
  name: "good",
  valueType: "Int",
  axesSpec: [{ name: "id", type: "String" }],
};
const brokenSpec: PColumnSpec = { ...spec, name: "broken" };

function inputField(
  name: string,
  value: OptionalSignedResourceId,
  error: OptionalSignedResourceId = NullSignedResourceId,
) {
  return {
    name,
    type: "Input",
    value,
    error,
    status: value === NullSignedResourceId ? "Assigned" : "Resolved",
    valueIsFinal: false,
  } satisfies FieldData;
}

function resource(
  id: SignedResourceId,
  type: ResourceType,
  fields: FieldData[],
  data?: unknown,
  state: Partial<
    Pick<ExtendedResourceData, "inputsLocked" | "outputsLocked" | "resourceReady" | "final">
  > = {},
): ExtendedResourceData {
  return {
    id,
    type,
    kind: data === undefined ? "Structural" : "Value",
    originalResourceId: NullSignedResourceId,
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

const good = createLocalPObjectId(["main", "frame"], "good");
const bad = createLocalPObjectId(["main", "frame"], "bad");
const broken = createLocalPObjectId(["main", "frame"], "broken");
const pending = createLocalPObjectId(["main", "frame"], "pending");
const specDriver = new SpecDriver();

afterAll(async () => {
  await specDriver.dispose();
});

/** Fields of a PFrame with a good column, an errored spec, and a good spec with errored data. */
const mixedFrame = [
  inputField("good.spec", SpecId),
  inputField("good.data", DataId),
  inputField("bad.spec", NullSignedResourceId, ErrorId),
  inputField("broken.spec", BrokenSpecId),
  inputField("broken.data", NullSignedResourceId, ErrorId),
];

/** A locked `outputs` StdMap with an errored field and one PFrame with the given fields. */
function outputsTree(
  frameFields: FieldData[],
  frameState: Partial<
    Pick<ExtendedResourceData, "inputsLocked" | "outputsLocked" | "resourceReady" | "final">
  > = {},
): PlTreeEntry {
  const tree = new PlTreeState(RootId, DefaultFinalResourceDataPredicate);
  tree.updateFromResourceData([
    resource(RootId, { name: ResourceTypeName.StdMap, version: "1" }, [
      inputField("failed", NullSignedResourceId, ErrorId),
      inputField("frame", FrameId),
    ]),
    resource(
      FrameId,
      { name: ResourceTypeName.PFrame, version: "1" },
      frameFields,
      undefined,
      frameState,
    ),
    resource(SpecId, { name: "json/object", version: "1" }, [], spec),
    resource(BrokenSpecId, { name: "json/object", version: "1" }, [], brokenSpec),
    resource(DataId, { name: "json/object", version: "1" }, [], {}),
    resource(ErrorId, { name: "json/resourceError", version: "1" }, [], {
      message: "ptabler ran out of memory",
    }),
  ]);
  return tree.entry();
}

const mixed = outputsTree(mixedFrame);

function registryOf(outputs: PlTreeNodeAccessor) {
  return buildColumnRegistry({ outputs, upstreamBlockCtxes: [] });
}

/** Run the columns driver over the `outputs` root of `entry` in a computable. */
function withDriver<T>(
  entry: PlTreeEntry,
  run: (
    driver: ColumnsCollectionDriverImpl<PlTreeNodeAccessor>,
    handle: CollectionHandle,
    host: ColumnsCollectionDriverHost<PlTreeNodeAccessor>,
  ) => T,
) {
  return Computable.make((c) => {
    const outputs = c.accessor(entry).node();
    const registry = registryOf(outputs);
    const host: ColumnsCollectionDriverHost<PlTreeNodeAccessor> = {
      resolveAccessor: () => outputs,
      getUpstreamBlockCtxes: () => [],
      getSpecDriver: () => specDriver,
      resolveSpec: (id) => resolveColumnSpec(registry, id),
    };
    const driver = new ColumnsCollectionDriverImpl<PlTreeNodeAccessor>();
    using collection = driver.create(
      [{ kind: "accessor", accessor: "outputs" as AccessorHandle, path: ["main"] }],
      host,
    );
    return run(driver, collection.key, host);
  }).getFullValue();
}

describe("host column registry over a tree with errored fields", () => {
  it("skips an errored output field, and resolveColumnSpec skips an errored spec", async () => {
    const result = await Computable.make((c) => {
      const registry = registryOf(c.accessor(mixed).node());
      return {
        goodSpec: resolveColumnSpec(registry, good),
        badSpec: resolveColumnSpec(registry, bad),
        goodColumn: resolvePColumnById(registry, good).spec,
      };
    }).getFullValue();

    expect(result.value).toEqual({ goodSpec: spec, badSpec: undefined, goodColumn: spec });
    expect(result.stable).toBe(true);
  });

  it("throws the real error from a direct lookup of a column with an errored spec", async () => {
    const lookup = Computable.make((c) =>
      resolvePColumnById(registryOf(c.accessor(mixed).node()), bad),
    );
    await expect(lookup.getValue()).rejects.toThrow(/ptabler ran out of memory/);
  });

  it("throws the real error from a direct lookup of a column with errored data", async () => {
    const lookup = Computable.make((c) =>
      resolvePColumnById(registryOf(c.accessor(mixed).node()), broken),
    );
    await expect(lookup.getValue()).rejects.toThrow(/ptabler ran out of memory/);
  });
});

describe("columns driver over a tree with errored fields", () => {
  it("skips an errored spec in getColumns and discover", async () => {
    const result = await withDriver(mixed, (driver, handle, host) => {
      using discovered = driver.discover(handle, {}, host);
      return {
        listed: driver.getColumns(handle, host),
        discovered: driver.getColumns(discovered.key, host).length,
      };
    });

    expect(result.value).toEqual({ listed: [good, broken], discovered: 2 });
    expect(result.stable).toBe(true);
  });

  it("keeps an unresolved spec of a locked PFrame, and is not stable", async () => {
    const entry = outputsTree([...mixedFrame, inputField("pending.spec", NullSignedResourceId)], {
      outputsLocked: false,
      resourceReady: false,
      final: false,
    });
    const result = await withDriver(entry, (driver, handle, host) =>
      driver.getColumns(handle, host),
    );

    expect(result.value).toEqual([good, broken, pending]);
    expect(result.stable).toBe(false);
  });

  it("reports isEmpty when every column has an errored spec", async () => {
    const entry = outputsTree([inputField("bad.spec", NullSignedResourceId, ErrorId)]);
    const result = await withDriver(entry, (driver, handle, host) => ({
      empty: driver.isEmpty(handle),
      listed: driver.getColumns(handle, host),
    }));

    expect(result.value).toEqual({ empty: true, listed: [] });
  });
});
