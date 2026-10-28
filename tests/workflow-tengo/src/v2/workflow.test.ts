import { vi } from "vitest";
import { tplTest } from "@platforma-sdk/test";
import { describeNode, exportsAt, hasValuesTree, renderWorkflowV2, resultJson } from "./render-v2";

// Each test renders several templates on a live backend.
vi.setConfig({ testTimeout: 60_000 });

const numbersRef = (block: string) => ({
  __isRef: true,
  blockId: `${block}/main`,
  name: "numbers",
});

tplTest.concurrent(
  "a v2 workflow returns result and its collection as exports, with the inputs the project passes",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const producer = await renderWorkflowV2(helper, "v2.producer", {
      blockId: "producer-1",
      args: { numbers: [3, 4, 5] },
    });

    expect(await resultJson(producer, "count")).eq(3);
    expect(await resultJson(producer, "blockId")).eq("producer-1");
    expect(await resultJson(producer, "isProduction")).eq(true);
    expect(await exportsAt(producer, [], describeNode)).toStrictEqual({
      type: "PFrame/1",
      fields: ["label.spec", "numbers.data", "numbers.spec"],
    });
  },
);

tplTest.concurrent(
  "a consumer resolves a producer's exported value through a BContext/2 chain",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const producer = await renderWorkflowV2(helper, "v2.producer", {
      blockId: "producer-2",
      args: { numbers: [1, 2] },
    });
    const consumer = await renderWorkflowV2(helper, "v2.consumer", {
      blockId: "consumer-2",
      args: { source: numbersRef("producer-2") },
      upstream: [{ block: "producer-2", render: producer }],
    });

    expect(await resultJson(consumer, "data")).toStrictEqual([1, 2]);
    expect(await resultJson(consumer, "spec")).toMatchObject({ name: "pl7.app/test/numbers" });
  },
);

tplTest.concurrent(
  "exports may be a sub-render's output, passed on unawaited, and downstream reads through it",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const producer = await renderWorkflowV2(helper, "v2.forward", {
      blockId: "forward-3",
      args: { ids: [7, 8] },
    });
    expect(await exportsAt(producer, [], describeNode)).toStrictEqual({
      type: "PFrame/1",
      fields: ["ids.data", "ids.spec"],
    });

    const consumer = await renderWorkflowV2(helper, "v2.consumer", {
      blockId: "consumer-3",
      args: { source: { __isRef: true, blockId: "forward-3/main", name: "ids" } },
      upstream: [{ block: "forward-3", render: producer }],
    });
    expect(await resultJson(consumer, "data")).toStrictEqual([7, 8]);
  },
);

tplTest.concurrent.for([
  { kind: "map", got: /got a map with keys \[sum\]/ },
  { kind: "json", got: /got a resource of type json\/object\/1/ },
  { kind: "wrongVersion", got: /got a resource of type PFrame\/2/ },
])("exports given as $kind are refused", async ({ kind, got }, { helper, pl, expect, skip }) => {
  if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

  const render = await renderWorkflowV2(helper, "v2.refuse", {
    blockId: `refuse-${kind}`,
    args: { kind },
  });
  await expect(resultJson(render, "x")).rejects.toThrow(got);
});

tplTest.concurrent(
  "an empty folder is accepted as exports",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const render = await renderWorkflowV2(helper, "v2.refuse", {
      blockId: "refuse-folder",
      args: { kind: "folder" },
    });
    expect(await exportsAt(render, [], describeNode)).toStrictEqual({
      type: "std/map/1",
      fields: [],
    });
  },
);

tplTest.concurrent(
  "a ref built with wf.ref resolves the value it names",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const producer = await renderWorkflowV2(helper, "v2.producer", {
      blockId: "ref-producer",
      args: { numbers: [4, 2] },
    });
    const consumer = await renderWorkflowV2(helper, "v2.ref-consumer", {
      blockId: "ref-consumer",
      args: { block: "ref-producer", workflow: "main", name: "numbers" },
      upstream: [{ block: "ref-producer", render: producer }],
    });
    expect(await resultJson(consumer, "data")).toStrictEqual([4, 2]);
  },
);
