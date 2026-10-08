import type { PlClient } from "@milaboratories/pl-client";
import {
  ContinuePolling,
  field,
  isNullSignedResourceId,
  parseSignedResourceId,
  poll,
  resourceIdFromString,
  TestHelpers,
  toGlobalResourceId,
} from "@milaboratories/pl-client";
import { getQuickJS } from "quickjs-emscripten";
import { expect, test } from "vitest";
import { ProjectHelper } from "../model/project_helper";
import { projectFieldName } from "../model/project_model";
import { BPSpecEnterV041NotPrepared, TestBPPreparer } from "../test/block_packs";
import { createProject, ProjectMutator } from "./project";

type ActionContextBaggage = Record<string, string>;

/** Reads the action context that prodActionContext resolves to, or undefined if the field is absent.
 * Polls until the field reference is resolved: it resolves asynchronously after the commit. */
async function readActionContext(
  pl: PlClient,
  prj: Awaited<ReturnType<typeof toGlobalResourceId>>,
  blockId: string,
): Promise<{ contextId: string; data: ActionContextBaggage } | undefined> {
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
      baggage: JSON.parse(Buffer.from(context.data!).toString()) as ActionContextBaggage,
    };
  });
}

test("block action context outlives its render and is replaced on re-render", async () => {
  //
  // Scenario:
  //  1. Create a project and render production of one block.
  //  2. Wait until the production output is final.
  //  3. Without actionContextApi:v1 on the backend: no prodActionContext field. Stop here.
  //  4. Read the action context through prodActionContext and check its baggage.
  //  5. Wait until the render is garbage collected; the context must stay readable.
  //  6. Re-render production: prodActionContext must point at a new context for the new render.
  //  7. Render and stop production in one transaction: prodActionContext must be removed.
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

    // 3. Without actionContextApi:v1 on the backend: no prodActionContext field.
    if (!pl.hasCapability("actionContextApi:v1")) {
      expect(await readActionContext(pl, prj, "block1")).toBeUndefined();
      return;
    }

    // 4. Read the action context through prodActionContext and check its baggage.
    const first = (await readActionContext(pl, prj, "block1"))!;
    expect(first).toBeDefined();
    expect(first.baggage["block-id"]).toEqual("block1");
    expect(first.baggage["name"]).toEqual("Block1");
    expect(JSON.parse(first.baggage["block-pack"])).toBeTypeOf("object");
    expect(first.baggage["resource"]).toEqual(first.baggage["root"]);

    // 5. Wait until the render is garbage collected; the context must stay readable.
    const renderId = resourceIdFromString(first.baggage["resource"])!;
    await poll(pl, async (tx) => {
      const render = await tx.tx.getResourceDataIfExists(renderId as never, false);
      expect(render).toBeUndefined();
    });
    const afterGc = (await readActionContext(pl, prj, "block1"))!;
    expect(afterGc.contextId).toEqual(first.contextId);
    expect(afterGc.baggage).toEqual(first.baggage);

    // 6. Re-render production: prodActionContext must point at a new context for the new render.
    await renderBlock([4, 5, 6], false);
    const second = (await readActionContext(pl, prj, "block1"))!;
    expect(second.contextId).not.toEqual(first.contextId);
    expect(second.baggage["resource"]).not.toEqual(first.baggage["resource"]);

    // 7. Render and stop production in one transaction: prodActionContext must be removed.
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
