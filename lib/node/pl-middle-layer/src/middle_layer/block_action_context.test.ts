import { Computable } from "@milaboratories/computable";
import type { SignedResourceId } from "@milaboratories/pl-client";
import {
  createSignedResourceId,
  DefaultFinalResourceDataPredicate,
  NullSignedResourceId,
} from "@milaboratories/pl-client";
import { PlTreeState } from "@milaboratories/pl-tree";
import { describe, expect, test } from "vitest";
import { projectFieldName } from "../model/project_model";
import type { BlockActionContextMode } from "./block_action_context";
import { blockActionContextTree } from "./block_action_context";

type FakeResource = {
  data?: Record<string, string>;
  fields: { name: string; value: SignedResourceId }[];
  kvs: { key: string; value: string }[];
};

function signedId(globalId: number): SignedResourceId {
  return createSignedResourceId(BigInt(globalId), new Uint8Array([1]) as never);
}

/** Reads the tree of block1 from a project tree that holds the given resources by global ID. */
async function readTree(
  resources: Map<string, FakeResource>,
  mode: BlockActionContextMode,
  blockId = "block1",
) {
  const tree = new PlTreeState(project, DefaultFinalResourceDataPredicate);
  tree.updateFromResourceData(
    [...resources].map(([id, r]) => ({
      id: signedId(Number(id)),
      type: { name: "ActionContext", version: "1" },
      kind: "Structural" as const,
      originalResourceId: NullSignedResourceId,
      error: NullSignedResourceId,
      inputsLocked: true,
      outputsLocked: true,
      resourceReady: true,
      final: false,
      data: r.data === undefined ? undefined : Buffer.from(JSON.stringify(r.data)),
      fields: r.fields.map(({ name, value }) => ({
        name,
        type: "Service" as const,
        value,
        error: NullSignedResourceId,
        status: "Resolved" as const,
        valueIsFinal: false,
      })),
      kv: r.kvs.map(({ key, value }) => ({ key, value: Buffer.from(value) })),
    })),
  );
  return await Computable.make((ctx) =>
    blockActionContextTree(ctx.accessor(tree.entry()).node(), blockId, mode),
  ).getValue();
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
        fields: [{ name: "child/32", value: child }],
        kvs: [
          // timestamps of different lengths: string order differs from time order
          { key: "transition/render/16/1000", value: '{"state":"Running"}' },
          { key: "transition/render/16/999", value: '{"state":"WaitingForInputs"}' },
          { key: "reading/exec/16/progress", value: "40" },
          { key: "reading/exec/16/stage", value: "align" },
          { key: "unrelated", value: "x" },
        ],
      },
    ],
    ["11", { data: { name: "staging render" }, fields: [], kvs: [] }],
    [
      "20",
      {
        data: { name: "child render" },
        fields: [{ name: "child/48", value: grandchild }],
        kvs: [{ key: "transition/render/32/5", value: '{"state":"Completed","detail":"ok"}' }],
      },
    ],
    ["30", { data: { name: "grandchild render" }, fields: [], kvs: [] }],
  ]);
}

describe("blockActionContextTree", () => {
  test("reads the prod tree with children, ordered transitions and readings", async () => {
    const tree = (await readTree(resources(), "prod"))!;

    expect(tree.contextId).toEqual("10");
    expect(tree.resource).toEqual("16");
    expect(tree.baggage).toEqual({ name: "prod render" });
    expect(tree.transitions.map((t) => [t.timestampNs, t.state])).toEqual([
      ["999", "WaitingForInputs"],
      ["1000", "Running"],
    ]);
    expect(tree.readings).toEqual([
      { namespace: "exec", resource: "16", key: "progress", value: "40" },
      { namespace: "exec", resource: "16", key: "stage", value: "align" },
    ]);

    expect(tree.children.map((c) => c.baggage["name"])).toEqual(["child render"]);
    const childNode = tree.children[0];
    expect(childNode.transitions).toEqual([
      {
        namespace: "render",
        resource: "32",
        timestampNs: "5",
        state: "Completed",
        detail: "ok",
        reason: "",
      },
    ]);
    expect(childNode.resource).toEqual("32");
    expect(childNode.children.map((c) => c.contextId)).toEqual(["30"]);
    expect(childNode.children[0].resource).toBeUndefined();
    expect(childNode.children[0].children).toEqual([]);
  });

  test("reads the staging tree for staging mode", async () => {
    const tree = (await readTree(resources(), "staging"))!;

    expect(tree.contextId).toEqual("11");
    expect(tree.baggage).toEqual({ name: "staging render" });
    expect(tree.children).toEqual([]);
  });

  test("returns undefined for a block without an action context field", async () => {
    expect(await readTree(resources(), "prod", "block2")).toBeUndefined();
  });
});
