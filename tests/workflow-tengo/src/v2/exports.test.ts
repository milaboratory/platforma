import { vi } from "vitest";
import { tplTest } from "@platforma-sdk/test";
import {
  describeNode,
  exportsAt,
  hasValuesTree,
  renderUiExport,
  renderWorkflowV2,
  resultJson,
} from "./render-v2";

// Each test renders several templates on a live backend.
vi.setConfig({ testTimeout: 240_000 });

tplTest.concurrent.for([
  { kind: "folderItem", message: /folder entry "col" is not a node; items belong in a collection/ },
  {
    kind: "folderMap",
    message: /folder entry "m" must be a typed node .* got a map with keys \[a\]/,
  },
  {
    kind: "dottedFolderEntry",
    message: /folder entry name "a\.b" contains "\.", which joins the names of a path/,
  },
  {
    kind: "dottedName",
    message: /item name "sum\.total" contains "\.", which joins the names of a path/,
  },
  { kind: "extraKey", message: /item "x" has key "label"; an item has only spec and data/ },
  { kind: "noSpec", message: /item "x" has no spec/ },
  {
    kind: "resolvedJsonField",
    message: /folder entry "f" must be a typed node .* got a resource of type json\/object\/1/,
  },
])(
  "the export constructors refuse $kind",
  async ({ kind, message }, { helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const render = await renderWorkflowV2(helper, "v2.refuse-constructors", {
      blockId: `refuse-constructor-${kind}`,
      args: { kind },
    });
    await expect(resultJson(render, "x")).rejects.toThrow(message);
  },
);

tplTest.concurrent(
  "values found upstream are passed on as exports: a hit without data stays spec-only, and the UI export leaves out data that is the no-result marker",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const producer = await renderWorkflowV2(helper, "v2.ui-tree", {
      blockId: "reexport-producer",
      args: { collectionRoot: true },
    });
    const ref = (name: string) => ({ block: "reexport-producer", workflow: "main", name });
    const consumer = await renderWorkflowV2(helper, "v2.reexport", {
      blockId: "reexport-consumer",
      args: { x: ref("x"), y: ref("y") },
      upstream: [{ block: "reexport-producer", render: producer }],
    });

    expect(await resultJson(consumer, "hitCount")).eq(1);
    expect(await exportsAt(consumer, [], describeNode)).toStrictEqual({
      type: "PFrame/1",
      fields: ["hit.spec", "resolved.data", "resolved.spec", "x.data", "x.spec"],
    });
    expect(await renderUiExport(helper, consumer)).toStrictEqual({
      type: "PFrame/1",
      fields: ["hit.spec", "resolved.spec", "x.data", "x.spec"],
    });
  },
);

tplTest.concurrent(
  "a value passed on without data is spec-only downstream: every query hit decodes without data, and a collection built from a resolved spec-only value leaves its data out",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const producer = await renderWorkflowV2(helper, "v2.ui-tree", {
      blockId: "passon-producer",
      args: { collectionRoot: true },
    });
    const y = { block: "passon-producer", workflow: "main", name: "y" };
    const x = { block: "passon-producer", workflow: "main", name: "x" };
    const passOn = await renderWorkflowV2(helper, "v2.reexport", {
      blockId: "passon-reexport",
      args: { x, y },
      upstream: [{ block: "passon-producer", render: producer }],
    });
    const collected = await renderWorkflowV2(helper, "v2.collect-resolved", {
      blockId: "passon-collected",
      args: { source: y },
      upstream: [{ block: "passon-producer", render: producer }],
    });
    expect(await exportsAt(collected, [], describeNode)).toStrictEqual({
      type: "PFrame/1",
      fields: ["v.spec"],
    });

    const downstream = await renderWorkflowV2(helper, "v2.requery", {
      blockId: "passon-downstream",
      upstream: [
        { block: "passon-reexport", render: passOn },
        { block: "passon-producer", render: producer },
      ],
    });
    const hits = (await resultJson(downstream, "hits")) as { name: string; hasData: boolean }[];
    expect(hits.map((h) => h.name).sort()).toStrictEqual(["hit", "resolved", "y"]);
    expect(hits.every((h) => !h.hasData)).toBe(true);
  },
);
