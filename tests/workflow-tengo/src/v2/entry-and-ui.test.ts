import type { PlTreeNodeAccessor } from "@milaboratories/pl-tree";
import { awaitStableState, tplTest } from "@platforma-sdk/test";
import path from "node:path";
import {
  describeNode,
  hasValuesTree,
  renderWorkflowV2,
  resultJson,
  type V2Render,
} from "./render-v2";

/** The compiled UI-export template as the SDK ships it. */
const uiExportTemplate = {
  type: "from-file" as const,
  // tests run from the package directory, as renderTemplate's own "./dist/..." paths assume
  path: path.resolve("../../sdk/workflow-tengo/dist/tengo/tpl/v2.export-for-ui.plj.gz"),
};

type Tree = { type: string; fields: string[]; children?: Record<string, Tree> };

/** The node's type and fields, descending into folders (std/map/1) only. */
function describeTree(a: PlTreeNodeAccessor | undefined): Tree | undefined {
  const node = describeNode(a);
  if (a === undefined || node === undefined) return undefined;
  if (node.type !== "std/map/1") return node;
  const children: Record<string, Tree> = {};
  for (const name of node.fields) {
    const child = describeTree(a.traverse({ field: name, assertFieldType: "Input" }));
    if (child !== undefined) children[name] = child;
  }
  return { ...node, children };
}

async function renderUiExport(helper: Parameters<typeof renderWorkflowV2>[0], exports: V2Render) {
  const ui = await helper.renderTemplate(true, uiExportTemplate, ["result"], (tx) => ({
    pf: tx.getFutureFieldValue(exports.resultEntry.rid, "exports", "Input"),
  }));
  return await awaitStableState(ui.computeOutput("result", (a) => describeTree(a)));
}

tplTest.concurrent(
  "the UI export of a folder tree mirrors it: folders stay std/map/1, collections become exported frames",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const producer = await renderWorkflowV2(helper, "v2.ui-tree", { blockId: "ui-tree" });
    expect(await renderUiExport(helper, producer)).toStrictEqual({
      type: "std/map/1",
      fields: ["a", "deeper", "empty"],
      children: {
        a: { type: "PFrame/1", fields: ["x.data", "x.spec"] },
        deeper: {
          type: "std/map/1",
          fields: ["b"],
          children: { b: { type: "PFrame/1", fields: ["y.spec"] } },
        },
        empty: { type: "std/map/1", fields: [], children: {} },
      },
    });
  },
);

tplTest.concurrent(
  "the UI export of a collection root is the exported frame",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const producer = await renderWorkflowV2(helper, "v2.ui-tree", {
      blockId: "ui-collection",
      args: { collectionRoot: true },
    });
    expect(await renderUiExport(helper, producer)).toStrictEqual({
      type: "PFrame/1",
      fields: ["x.data", "x.spec", "y.spec"],
    });
  },
);

const mixedEntries = /a v2 workflow's outputs are exactly result and exports/;

tplTest.concurrent.for([
  { template: "v2.guard-v2-first", args: {} },
  { template: "v2.guard-v1-first", args: {} },
  { template: "v2.guard-prepare", args: { never: false } },
  { template: "v2.guard-prepare", args: { never: true } },
])(
  "a template that also imports the V1 workflow entry is stopped ($template, $args)",
  async ({ template, args }, { helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const render = await renderWorkflowV2(helper, template, {
      blockId: `guard-${template}-${String(args.never ?? "")}`,
      args,
    });
    await expect(resultJson(render, "ran")).rejects.toThrow(mixedEntries);
  },
);

tplTest.concurrent.for([{ isProduction: true }, { isProduction: false }])(
  "prepare runs before the body whether the render is a run or an auto one (isProduction $isProduction)",
  async ({ isProduction }, { helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const render = await renderWorkflowV2(helper, "v2.guard-ok-prepare", {
      blockId: `prepare-${isProduction}`,
      isProduction,
    });
    expect(await resultJson(render, "x")).eq(42);
    expect(await resultJson(render, "isProduction")).eq(isProduction);
  },
);
