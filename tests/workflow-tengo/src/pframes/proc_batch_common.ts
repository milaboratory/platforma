import type { PlTransaction, PUniversalColumnSpec } from "@milaboratories/pl-middle-layer";
import { Annotation, Pl, resourceType } from "@milaboratories/pl-middle-layer";
import type { TplTestHelpers } from "@platforma-sdk/test";
import { awaitStableState } from "@platforma-sdk/test";
import type { ExpectStatic } from "vitest";
import type { SimpleNode, SimpleNodeResource, SimpleTreeHelper } from "./extended_tpl_test";
import { assertBlob, assertResource } from "./extended_tpl_test";

// Xsv settings: body returns TSV with "key" as axis, "heavyChain" as value column
export const xsvSettings = {
  batchKeyColumns: ["key"],
  columns: [
    {
      column: "heavyChain",
      id: "heavyChain",
      spec: {
        valueType: "String",
        name: "heavyChain",
        annotations: {
          [Annotation.Label]: "Heavy Chain",
        } satisfies Annotation,
      },
    },
  ],
  storageFormat: "Json",
} as const;

export const singleAxisSpec: PUniversalColumnSpec = {
  kind: "PColumn",
  name: "sequence",
  valueType: "String",
  axesSpec: [{ name: "key", type: "String" }],
};

export const twoAxisSpec: PUniversalColumnSpec = {
  kind: "PColumn",
  name: "sequence",
  valueType: "String",
  axesSpec: [
    { name: "sampleId", type: "String" },
    { name: "key", type: "String" },
  ],
};

export const xsvSettingsIsolation = {
  batchKeyColumns: ["key"],
  columns: [
    {
      column: "heavyChain",
      id: "heavyChain",
      spec: {
        valueType: "String",
        name: "heavyChain",
        annotations: {
          [Annotation.Label]: "Heavy Chain",
        } satisfies Annotation,
      },
    },
  ],
  storageFormat: "Json",
} as const;

export const TIMEOUT = 60_000;

/** Creates a locked PColumnData/Json resource from a record map. */
export function createJsonData(
  tx: PlTransaction,
  keyLength: number,
  data: Record<string, unknown>,
) {
  const res = tx.createStruct(
    resourceType("PColumnData/Json", "1"),
    JSON.stringify({ keyLength, data }),
  );
  tx.lockInputs(res);
  return res;
}

/** Serializes `params` as a Pl.JsonObject value (the proc_batch template contract). */
export function jsonParams(tx: PlTransaction, params: Record<string, unknown>) {
  return tx.createValue(Pl.JsonObject, JSON.stringify(params));
}

type RenderInputs = Parameters<TplTestHelpers["renderTemplate"]>[3];

/**
 * Renders the `pframes.proc_batch` template, awaits the tree to stabilise, and
 * returns the top-level "result" resource already asserted.
 */
export async function runBatch(
  helper: TplTestHelpers,
  stHelper: SimpleTreeHelper,
  build: RenderInputs,
): Promise<SimpleNodeResource> {
  const rendered = await helper.renderTemplate(true, "pframes.proc_batch", ["result"], build);
  const tree = stHelper.tree(rendered.resultEntry);
  const finalResult = await awaitStableState(tree, TIMEOUT);
  assertResource(finalResult);
  const theResult = finalResult.inputs["result"];
  assertResource(theResult);
  return theResult;
}

/** Reads the single "[]" partition of a JsonPartitioned data resource as JSON. */
export function readJsonPartition(dataResource: SimpleNode): Record<string, unknown> {
  assertResource(dataResource);
  const blob = dataResource.inputs["[]"];
  assertBlob(blob);
  return JSON.parse(Buffer.from(blob.content).toString()) as Record<string, unknown>;
}

/** Asserts the template call panicked with a message matching `pattern`. */
export async function expectPanic(
  helper: TplTestHelpers,
  stHelper: SimpleTreeHelper,
  expect: ExpectStatic,
  build: RenderInputs,
  pattern: RegExp,
) {
  const rendered = await helper.renderTemplate(true, "pframes.proc_batch", ["result"], build);
  const tree = stHelper.tree(rendered.resultEntry);
  await expect(awaitStableState(tree, TIMEOUT)).rejects.toThrow(pattern);
}
