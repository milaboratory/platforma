import type { PlClient, SignedResourceId } from "@milaboratories/pl-client";
import {
  ContinuePolling,
  field,
  isNullSignedResourceId,
  parseSignedResourceId,
  poll,
  TestHelpers,
  toGlobalResourceId,
} from "@milaboratories/pl-client";
import { getQuickJS } from "quickjs-emscripten";
import { expect, test } from "vitest";
import { ProjectHelper } from "../model/project_helper";
import { projectFieldName } from "../model/project_model";
import { BPSpecEnterV041NotPrepared, TestBPPreparer } from "../test/block_packs";
import { Computable } from "@milaboratories/computable";
import { SynchronizedTreeState } from "@milaboratories/pl-tree";
import { blockActionContextTree } from "../middle_layer/block_action_context";
import { createProject, ProjectMutator } from "./project";

type ActionContextBaggage = Record<string, string>;

/** Reads the action context that prodActionContext points to, or undefined if the field is absent.
 * Polls until the field reference is resolved: it resolves asynchronously after the commit. */
async function readActionContext(
  pl: PlClient,
  prj: Awaited<ReturnType<typeof toGlobalResourceId>>,
  blockId: string,
): Promise<
  { contextId: string; contextRef: SignedResourceId; baggage: ActionContextBaggage } | undefined
> {
  return await poll(pl, async ({ tx }) => {
    const project = await tx.getResourceData(prj, true);
    const actionContextField = project.fields.find(
      (f) => f.name === projectFieldName(blockId, "prodActionContext"),
    );
    if (actionContextField === undefined) return undefined;

    const contextRef = actionContextField.value;
    if (isNullSignedResourceId(contextRef)) throw new ContinuePolling();
    const context = await tx.getResourceData(contextRef, false);
    expect(context.type.name).toEqual("ActionContext");
    return {
      contextId: String(parseSignedResourceId(contextRef).globalId),
      contextRef,
      baggage: JSON.parse(Buffer.from(context.data!).toString()) as ActionContextBaggage,
    };
  });
}

/** Returns the render an action context belongs to: the resource of the Running transition that the
 * workflow controller records when it evaluates the render. The key names the decimal resource ID.
 * Polls until the transition lands: reports are applied asynchronously after the commit. */
async function contextRender(pl: PlClient, contextRef: SignedResourceId): Promise<string> {
  return await poll(pl, async ({ tx }) => {
    const kv = await tx.listKeyValuesString(contextRef);
    const running = kv.find((e) => e.key.startsWith("transition/render/"));
    if (running === undefined) throw new ContinuePolling();
    expect(JSON.parse(running.value)).toMatchObject({ state: "Running" });
    return running.key.split("/")[2];
  });
}

test("block action context outlives its render and is replaced on re-render", async () => {
  //
  // Scenario:
  //  1. Create a project and render production of one block.
  //  2. Wait until the production output is final.
  //  3. Without optionalServiceField:v1 the render has no action context. Otherwise read the action
  //     context through prodActionContext and check its baggage.
  //  4. The context has the Running transition of the render. Wait until the render is garbage
  //     collected; the context must stay readable.
  //  5. Re-render production: prodActionContext must point at a new context with a new run-id.
  //  6. Render and stop production in one transaction: prodActionContext must be removed.
  //

  const quickJs = await getQuickJS();

  await TestHelpers.withTempRoot(async (pl) => {
    // 1. Create a project and render production of one block.
    const prj = await pl.withWriteTx("CreatingProject", async (tx) => {
      const prjRef = await createProject(tx);
      tx.createField(field(tx.clientRoot, "prj"), "Dynamic", prjRef);
      await tx.commit();
      return await toGlobalResourceId(prjRef);
    });

    const renderBlock = async (numbers: number[], addBlock: boolean) =>
      await pl.withWriteTx("RenderBlock", async (tx) => {
        const mut = await ProjectMutator.load(new ProjectHelper(quickJs), tx, prj);
        if (addBlock)
          mut.addBlock(
            { id: "block1", label: "Block1", renderingMode: "Heavy" },
            {
              storageMode: "legacy",
              legacyState: JSON.stringify({ args: { numbers } }),
              blockPack: await TestBPPreparer.prepare(BPSpecEnterV041NotPrepared),
            },
          );
        else
          mut.setStates([
            { modelAPIVersion: 1, blockId: "block1", state: { args: { numbers }, uiState: {} } },
          ]);
        mut.renderProduction(["block1"], true);
        mut.save();
        await tx.commit();
      });

    await renderBlock([1, 2, 3], true);

    // 2. Wait until the production output is final.
    await poll(pl, async (tx) => {
      const prjR = await tx.get(prj);
      await prjR.get(projectFieldName("block1", "prodOutput")).then((r) => r.final());
    });

    // 3. Read the action context through prodActionContext and check its baggage.
    if (!pl.hasCapability("optionalServiceField:v1")) {
      expect(await readActionContext(pl, prj, "block1")).toBeUndefined();
      return;
    }
    const first = (await readActionContext(pl, prj, "block1"))!;
    expect(first).toBeDefined();
    expect(Object.keys(first.baggage).sort()).toEqual(["block-id", "block-pack", "name", "run-id"]);
    expect(first.baggage["block-id"]).toEqual("block1");
    expect(first.baggage["name"]).toEqual("Block1");
    expect(JSON.parse(first.baggage["block-pack"])).toBeTypeOf("object");
    expect(first.baggage["run-id"]).toMatch(/^[0-9a-f-]{36}$/);

    // 4. The Running transition names the render; the context outlives it.
    const firstRender = await contextRender(pl, first.contextRef);
    await poll(pl, async (tx) => {
      const render = await tx.tx.getResourceDataIfExists(BigInt(firstRender) as never, false);
      expect(render).toBeUndefined();
    });
    const afterGc = (await readActionContext(pl, prj, "block1"))!;
    expect(afterGc.contextId).toEqual(first.contextId);
    expect(afterGc.baggage).toEqual(first.baggage);

    // 4b. The read-back sees the same context with its baggage, and names the render.
    const prjTree = await SynchronizedTreeState.init(pl, prj, {
      pollingInterval: 250,
      stopPollingDelay: 500,
    });
    const tree = (await Computable.make((ctx) =>
      blockActionContextTree(ctx.accessor(prjTree.entry()).node(), "block1", "prod"),
    ).getValue())!;
    await prjTree.terminate();
    expect(tree).toBeDefined();
    expect(tree.contextId).toEqual(first.contextId);
    expect(tree.baggage).toEqual(first.baggage);
    expect(tree.resource).toEqual(firstRender);
    expect(tree.transitions.map((t) => [t.namespace, t.resource, t.state])).toContainEqual([
      "render",
      firstRender,
      "Running",
    ]);

    // 5. Re-render production: prodActionContext must point at a new context with a new run-id.
    await renderBlock([4, 5, 6], false);
    const second = (await readActionContext(pl, prj, "block1"))!;
    expect(second.contextId).not.toEqual(first.contextId);
    expect(second.baggage["run-id"]).not.toEqual(first.baggage["run-id"]);
    expect(await contextRender(pl, second.contextRef)).not.toEqual(firstRender);

    // 6. Render and stop production in one transaction: prodActionContext must be removed.
    await pl.withWriteTx("RenderAndStop", async (tx) => {
      const mut = await ProjectMutator.load(new ProjectHelper(quickJs), tx, prj);
      mut.setStates([
        { modelAPIVersion: 1, blockId: "block1", state: { args: { numbers: [7] }, uiState: {} } },
      ]);
      mut.renderProduction(["block1"], true);
      mut.stopProduction("block1");
      mut.save();
      await tx.commit();
    });
    expect(await readActionContext(pl, prj, "block1")).toBeUndefined();
  });
});
