import type { PlClient, PlTransaction, SignedResourceId } from "@milaboratories/pl-client";
import { createSignedResourceId, parseSignedResourceId } from "@milaboratories/pl-client";
import { describe, expect, test } from "vitest";
import { projectFieldName } from "../model/project_model";
import { readBlockActionContextTree } from "./block_action_context";

type FakeResource = {
  data?: Record<string, string>;
  fields: { name: string; value: SignedResourceId }[];
  kvs: { key: string; value: string }[];
};

function signedId(globalId: number): SignedResourceId {
  return createSignedResourceId(BigInt(globalId), new Uint8Array([1]) as never);
}

/** A client whose read transaction serves the given resources by global ID. */
function fakeClient(resources: Map<string, FakeResource>): PlClient {
  const lookup = (ref: SignedResourceId) => {
    const resource = resources.get(String(parseSignedResourceId(ref).globalId));
    if (resource === undefined) throw new Error(`no resource ${ref}`);
    return resource;
  };
  const tx = {
    getResourceData: async (ref: SignedResourceId) => {
      const resource = lookup(ref);
      return {
        data: resource.data === undefined ? undefined : Buffer.from(JSON.stringify(resource.data)),
        fields: resource.fields,
      };
    },
    listKeyValuesString: async (ref: SignedResourceId) => lookup(ref).kvs,
  } as unknown as PlTransaction;

  return {
    withReadTx: async (_name: string, body: (tx: PlTransaction) => Promise<unknown>) =>
      await body(tx),
  } as unknown as PlClient;
}

const project = signedId(1);
const prodRoot = signedId(10);
const stagingRoot = signedId(11);
const child = signedId(20);
const grandchild = signedId(30);

function resources(): Map<string, FakeResource> {
  return new Map<string, FakeResource>([
    [
      "1",
      {
        fields: [
          { name: projectFieldName("block1", "prodActionContext"), value: prodRoot },
          { name: projectFieldName("block1", "stagingActionContext"), value: stagingRoot },
        ],
        kvs: [],
      },
    ],
    [
      "10",
      {
        data: { name: "prod render" },
        fields: [
          { name: "child/NG:0x20", value: child },
          { name: "other", value: signedId(99) },
        ],
        kvs: [
          // timestamps of different lengths: string order differs from time order
          { key: "transition/core/NG:0x10/1000", value: '{"state":"Running"}' },
          { key: "transition/core/NG:0x10/999", value: '{"state":"WaitingForInputs"}' },
          { key: "reading/exec/NG:0x10/progress/00000000000000ff", value: "40" },
          { key: "reading/exec/NG:0x10/stage", value: "align" },
          { key: "unrelated", value: "x" },
        ],
      },
    ],
    ["11", { data: { name: "staging render" }, fields: [], kvs: [] }],
    [
      "20",
      {
        data: { name: "child render" },
        fields: [{ name: "child/NG:0x30", value: grandchild }],
        kvs: [{ key: "transition/core/NG:0x20/5", value: '{"state":"Completed","detail":"ok"}' }],
      },
    ],
    ["30", { data: { name: "grandchild render" }, fields: [], kvs: [] }],
  ]);
}

describe("readBlockActionContextTree", () => {
  test("reads the prod tree with children, ordered transitions and readings", async () => {
    const tree = (await readBlockActionContextTree(
      fakeClient(resources()),
      project,
      "block1",
      "prod",
    ))!;

    expect(tree.contextId).toEqual("10");
    expect(tree.baggage).toEqual({ name: "prod render" });
    expect(tree.transitions.map((t) => [t.timestampNs, t.state])).toEqual([
      ["999", "WaitingForInputs"],
      ["1000", "Running"],
    ]);
    expect(tree.readings).toEqual([
      { namespace: "exec", resource: "NG:0x10", key: "progress", value: "40" },
      { namespace: "exec", resource: "NG:0x10", key: "stage", value: "align" },
    ]);

    expect(tree.children.map((c) => c.baggage["name"])).toEqual(["child render"]);
    const childNode = tree.children[0];
    expect(childNode.transitions).toEqual([
      {
        namespace: "core",
        resource: "NG:0x20",
        timestampNs: "5",
        state: "Completed",
        detail: "ok",
        reason: "",
      },
    ]);
    expect(childNode.children.map((c) => c.contextId)).toEqual(["30"]);
    expect(childNode.children[0].children).toEqual([]);
  });

  test("reads the staging tree for staging mode", async () => {
    const tree = (await readBlockActionContextTree(
      fakeClient(resources()),
      project,
      "block1",
      "staging",
    ))!;

    expect(tree.contextId).toEqual("11");
    expect(tree.baggage).toEqual({ name: "staging render" });
    expect(tree.children).toEqual([]);
  });

  test("returns undefined for a block without an action context field", async () => {
    expect(
      await readBlockActionContextTree(fakeClient(resources()), project, "block2", "prod"),
    ).toBeUndefined();
  });
});
