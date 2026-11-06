import type {
  AnyRef,
  MiddleLayerDriverKit,
  PlClient,
  PlTransaction,
} from "@milaboratories/pl-middle-layer";
import { field, Pl } from "@milaboratories/pl-middle-layer";
import type { PlTreeNodeAccessor } from "@milaboratories/pl-tree";
import type { TestRenderResults, TplTestHelpers } from "@platforma-sdk/test";
import { awaitStableState } from "@platforma-sdk/test";
import path from "node:path";

/** The backend capability of the BContext/2 family; v2 tests skip without it. */
export const VALUES_TREE_CAPABILITY = "contextValuesTree:v1";

export function hasValuesTree(pl: PlClient): boolean {
  return pl.serverInfo.capabilities?.includes(VALUES_TREE_CAPABILITY) ?? false;
}

export type V2Render = TestRenderResults<"result" | "exports">;

/** A block whose rendered exports a downstream render reads, through a BContext/2 it is linked into. */
export type Upstream = {
  readonly block: string;
  readonly workflow?: string;
  readonly render: V2Render;
};

export type RenderV2Options = {
  readonly blockId: string;
  readonly args?: Record<string, unknown>;
  /** true for a run workflow (the default), false for an auto one */
  readonly isProduction?: boolean;
  /** contexts from the nearest to the farthest; none gives a chain of one BContextEnd/1 */
  readonly upstream?: readonly Upstream[];
};

const BContext2 = { name: "BContext", version: "2" };
const BContextEnd = { name: "BContextEnd", version: "1" };

/** A chain as the project builds it: one input-locked BContext/2 per upstream block, `id` the
 *  JSON string "<block>/<workflow>", `parent/000` the next context, `values` the block's `exports`. */
export function contextChain(tx: PlTransaction, upstream: readonly Upstream[]): AnyRef {
  let chain: AnyRef = tx.createEphemeral(BContextEnd);
  tx.lock(chain);
  for (const u of [...upstream].reverse()) {
    const ctx = tx.createEphemeral(BContext2);
    tx.createField(
      field(ctx, "id"),
      "Input",
      tx.createValue(Pl.JsonString, JSON.stringify(`${u.block}/${u.workflow ?? "main"}`)),
    );
    tx.createField(field(ctx, "parent/000"), "Input", chain);
    tx.createField(
      field(ctx, "values"),
      "Input",
      tx.getFutureFieldValue(u.render.resultEntry.rid, "exports", "Input"),
    );
    tx.lockInputs(ctx);
    chain = ctx;
  }
  return chain;
}

/** How long a test waits for one render's output: renders queue behind the rest of the suite on a
 *  shared backend, so this is generous. */
export const OUTPUT_TIMEOUT = 60_000;

/** Renders a v2 workflow template with inputs typed as the project types them. */
export async function renderWorkflowV2(
  helper: TplTestHelpers,
  template: string,
  ops: RenderV2Options,
): Promise<V2Render> {
  return await helper.renderTemplate(true, template, ["result", "exports"], (tx) => ({
    args: tx.createValue(Pl.JsonObject, JSON.stringify(ops.args ?? {})),
    blockId: tx.createValue(Pl.JsonString, JSON.stringify(ops.blockId)),
    isProduction: tx.createValue(Pl.JsonBool, JSON.stringify(ops.isProduction ?? true)),
    context: contextChain(tx, ops.upstream ?? []),
  }));
}

/** The JSON of `result`'s entry `name`, once stable. Works for any render with a `result` output. */
export async function resultJson(
  render: TestRenderResults<"result">,
  name: string,
  timeout: number = OUTPUT_TIMEOUT,
): Promise<unknown> {
  return await awaitStableState(
    render.computeOutput("result", (a) =>
      a?.traverse({ field: name, assertFieldType: "Input" })?.getDataAsJson(),
    ),
    timeout,
  );
}

/** The content of the file exported as `result`'s entry `name` (a `file.exportFile` handle). */
export async function resultFileContent(
  render: TestRenderResults<"result">,
  name: string,
  driverKit: MiddleLayerDriverKit,
  timeout: number = 60_000,
): Promise<string> {
  const handle = await awaitStableState(
    render.computeOutput("result", (a, ctx) => {
      const file = a?.traverse({ field: name, assertFieldType: "Input" });
      if (file === undefined) return undefined;
      return driverKit.blobDriver.getOnDemandBlob(file.persist(), ctx).handle;
    }),
    timeout,
  );
  if (handle === undefined) throw new Error(`no file in result entry ${name}`);
  return (await driverKit.blobDriver.getContent(handle)).toString();
}

/** Reads the node at `path` (field names, each an Input) under the `exports` root, once stable. */
export async function exportsAt<R>(
  render: V2Render,
  path: readonly string[],
  read: (a: PlTreeNodeAccessor | undefined) => R,
  timeout: number = OUTPUT_TIMEOUT,
) {
  return await awaitStableState(
    render.computeOutput("exports", (a) => {
      let node = a;
      for (const name of path) node = node?.traverse({ field: name, assertFieldType: "Input" });
      return read(node);
    }),
    timeout,
  );
}

/** The type of a node as "Name/Version" and its input field names, sorted. */
export function describeNode(a: PlTreeNodeAccessor | undefined) {
  if (a === undefined) return undefined;
  return {
    type: `${a.resourceType.name}/${a.resourceType.version}`,
    fields: a.listInputFields().slice().sort(),
  };
}

/** The compiled UI-export template as the SDK ships it. */
const uiExportTemplate = {
  type: "from-file" as const,
  // tests run from the package directory, as renderTemplate's own "./dist/..." paths assume
  path: path.resolve("../../sdk/workflow-tengo/dist/tengo/tpl/v2.export-for-ui.plj.gz"),
};

export type Tree = { type: string; fields: string[]; children?: Record<string, Tree> };

/** The node's type and fields, descending into folders (std/map/1) only. */
export function describeTree(a: PlTreeNodeAccessor | undefined): Tree | undefined {
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

export async function renderUiExport(helper: TplTestHelpers, exports: V2Render) {
  const ui = await helper.renderTemplate(true, uiExportTemplate, ["result"], (tx) => ({
    pf: tx.getFutureFieldValue(exports.resultEntry.rid, "exports", "Input"),
  }));
  return await awaitStableState(
    ui.computeOutput("result", (a) => describeTree(a)),
    OUTPUT_TIMEOUT,
  );
}
