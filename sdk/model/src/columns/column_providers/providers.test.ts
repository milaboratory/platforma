import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { AccessorHandle } from "@milaboratories/pl-model-common";
import { createLocalPObjectId, ResourceTypeName } from "@milaboratories/pl-model-common";
import { TreeNodeAccessor } from "../../render/accessor";
import type { FieldTraversalStep } from "../../render/traversal_ops";
import { AccessorColumnsProviderImpl } from "./providers";

type FakeField = string | null | { readonly error: string };

type FakeNode = {
  readonly type: string;
  readonly fields?: Record<string, FakeField>;
  readonly data?: unknown;
};

const specError = "ptabler ran out of memory";

const nodes: Record<string, FakeNode> = {
  root: {
    type: ResourceTypeName.StdMap,
    fields: { failed: { error: specError }, frame: "frame" },
  },
  frame: {
    type: ResourceTypeName.PFrame,
    fields: { "good.spec": "spec", "bad.spec": { error: specError }, "unset.spec": null },
  },
  spec: { type: "json/object", data: { kind: "PColumn", name: "good", axesSpec: [] } },
};

function node(handle: string): FakeNode {
  const found = nodes[handle];
  if (found === undefined) throw new Error(`fake ctx: no node ${handle}`);
  return found;
}

/** A render ctx over {@link nodes}. Every node has locked inputs. */
const fakeCtx = {
  resolveWithCommon: (
    handle: string,
    common: { pureFieldErrorToUndefined?: true },
    step: FieldTraversalStep | string,
  ) => {
    const { field, pureFieldErrorToUndefined } =
      typeof step === "string" ? { ...common, field: step } : { ...common, ...step };
    const value = node(handle).fields?.[field];
    if (value === undefined || value === null) return undefined;
    if (typeof value === "string") return value;
    if (pureFieldErrorToUndefined) return undefined;
    throw new Error(value.error);
  },
  getResourceType: (handle: string) => ({ name: node(handle).type, version: "1" }),
  listInputFields: (handle: string) => Object.keys(node(handle).fields ?? {}),
  getInputsLocked: () => true,
  hasData: (handle: string) => node(handle).data !== undefined,
  getDataAsString: (handle: string) => JSON.stringify(node(handle).data),
};

beforeEach(() => {
  (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx = fakeCtx;
});

afterEach(() => {
  delete (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx;
});

describe("AccessorColumnsProvider.getColumns", () => {
  test("lists only the readable columns of a walk with errored and unset fields", () => {
    const root = new TreeNodeAccessor("root" as AccessorHandle, ["main"]);
    const columns = new AccessorColumnsProviderImpl(root).getColumns();
    expect(columns.map((c) => c.id)).toEqual([createLocalPObjectId(["main", "frame"], "good")]);
  });
});
