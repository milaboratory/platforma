import {
  AnyRef,
  field,
  loadTemplate,
  Pl,
  PlTransaction,
  poll,
  prepareTemplateSource,
  ResourceType,
  TemplateSourceAny,
} from "@milaboratory/pl-middle-layer";
import { templateTest } from "./template-test";
import * as tp from "node:timers/promises";
import { SynchronizedTreeState } from "@milaboratory/pl-tree";
import { Computable } from "@milaboratory/computable";

export const EphRenderTemplate: ResourceType = {
  name: "EphRenderTemplate",
  version: "1",
};
export const RenderTemplate: ResourceType = {
  name: "RenderTemplate",
  version: "1",
};

function createRenderTemplate<O extends string>(
  tx: PlTransaction,
  tpl: AnyRef,
  inputs: Pl.PlRecord,
  outputNames: O[]
): Record<O, AnyRef> {
  const rId = tx.createEphemeral(RenderTemplate);

  const tplField = field(rId, "template");
  const inputsField = field(rId, "inputs");

  tx.createField(tplField, "Input", tpl);
  tx.createField(inputsField, "Input", Pl.createPlMap(tx, inputs, true));
  tx.lockInputs(rId);

  return Pl.futureRecord(tx, rId, outputNames, "Output", "outputs/");
}

templateTest("test1", async ({ pl }) => {
  const src = await prepareTemplateSource({
    type: "from-file",
    path: "./dist/tengo/tpl/test.simplest1.plj.gz",
  });
  await pl.withWriteTx("test", async (tx) => {
    const result = field(tx.clientRoot, "result");
    tx.createField(result, "Dynamic");
    const tpl = loadTemplate(tx, src);
    const input = tx.createValue(
      Pl.JsonObject,
      JSON.stringify({ testValue: "Truman" })
    );
    const outputs = createRenderTemplate(tx, tpl, { input1: input }, ["main"]);
    tx.setField(result, outputs.main);
    await tx.commit();
  });
  const rootTree = await SynchronizedTreeState.init(pl, pl.clientRoot, {
    pollingInterval: 500,
    stopPollingDelay: 1000,
  });
  const result = Computable.make((ctx) => {
    const res = ctx.accessor(rootTree.entry()).node().traverse("result");
    if (res === undefined) ctx.markUnstable();
    return res?.getDataAsJson();
  });
  // await tp.setTimeout(3000);
  console.dir(await result.awaitStableValue(), { depth: 5 });
});
