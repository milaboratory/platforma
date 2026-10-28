import { tplTest } from "@platforma-sdk/test";
import {
  describeNode,
  exportsAt,
  hasValuesTree,
  renderUiExport,
  renderWorkflowV2,
  resultJson,
} from "./render-v2";

tplTest.concurrent.for([
  { kind: "folderItem", message: /folder entry "col" is not a node; items belong in a collection/ },
  {
    kind: "folderMap",
    message: /folder entry "m" must be a typed node .* got a map with keys \[a\]/,
  },
  {
    kind: "dottedName",
    message: /item name "sum\.total" contains "\.", which joins the names of a path/,
  },
  { kind: "extraKey", message: /item "x" has key "label"; an item has only spec and data/ },
  { kind: "noSpec", message: /item "x" has no spec/ },
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
    const ref = (name: string) => ({ __isRef: true, blockId: "reexport-producer/main", name });
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
