import { Pl } from "@milaboratories/pl-middle-layer";
import { awaitStableState, tplTest } from "@platforma-sdk/test";

tplTest.concurrent("test resolve in pure template", async ({ helper, expect }) => {
  const result = await helper.renderTemplate(false, "resolve.pure-template", ["main"], (tx) => ({
    a: tx.createValue(Pl.JsonObject, JSON.stringify("A")),
    b: tx.createValue(Pl.JsonObject, JSON.stringify("B")),
  }));
  const mainResult = result.computeOutput("main", (a) => a?.getDataAsJson());

  expect(await mainResult.awaitStableValue()).eq("ABcd");
});

tplTest.concurrent("test resolve in ephemeral template", async ({ helper, expect }) => {
  const result = await helper.renderTemplate(true, "resolve.eph-template", ["main"], (tx) => ({
    a: tx.createValue(Pl.JsonObject, JSON.stringify("A")),
    b: tx.createValue(Pl.JsonObject, JSON.stringify("B")),
  }));
  const mainResult = result.computeOutput("main", (a) => a?.getDataAsJson());

  expect(await mainResult.awaitStableValue()).eq("ABcd");
});

tplTest.concurrent("test resolve in workflow", async ({ helper, expect }) => {
  const result = await helper.renderWorkflow("resolve.wf", false, {
    a: "A",
    b: "B",
  });

  const mainResult = result.output("main", (a) => a?.getDataAsJson());

  expect(await mainResult.awaitStableValue()).eq("ABcd");
});

tplTest.concurrent(
  "should return undefined on no result in resolve",
  async ({ helper, expect }) => {
    const result = await helper.renderWorkflow("resolve.wf_no_res", false, {
      errIfMissing: false,
    });

    const mainResult = result.output("rr", (a) => a?.getDataAsJson());

    console.dir(mainResult, { depth: 5 });

    expect(await mainResult.awaitStableValue()).eq("success");
  },
);

tplTest.concurrent(
  "end-to-end: resolve PrimaryRef, pass to ephemeral template, awaitState proceeds",
  async ({ helper, expect }) => {
    // Setup: workflow that exports PColumns (e2 has spec + null data)
    const setup = await helper.renderWorkflow(
      "workflow.exports.wf1",
      false,
      { a: "a", b: "b" },
      { blockId: "b1" },
    );
    const ctx = await awaitStableState(setup.context());

    // Consumer: resolve PrimaryRef via wf.resolve() deep-walk,
    // pass resolved column to ephemeral template with awaitState
    const consumer = await helper.renderWorkflow(
      "resolve.e2e-primary",
      false,
      {},
      { parent: ctx, blockId: "b2" },
    );

    const result = await awaitStableState(consumer.output("main", (a) => a?.getDataAsJson()));
    expect(result).eq("resolved_and_ready");
  },
);
