import { tplTest } from "@platforma-sdk/test";

tplTest.concurrent("block action context from templates", async ({ helper, expect, pl }) => {
  //
  // Scenario:
  //  1. Render the root template: it creates its action context, records "Running" and renders
  //     a child template, which sets an reading.
  //  2. Without actionContextApi on the backend: the calls are no-ops and both templates still finish.
  //  3. With actionContextApi: the root context has the transition and the template name of a child context;
  //     the child context has the reading.
  //

  const result = await helper.renderTemplate(
    true,
    "action-context.tree",
    ["context", "child"],
    () => ({}),
  );

  // 1. Both templates finish.
  const child = result.computeOutput("child", (a) => a?.getDataAsJson());
  expect(await child.awaitStableValue()).eq("ok");

  // 2. Without actionContextApi, nothing else to check.
  if (!pl.hasCapability("actionContextApi:v1")) return;

  // 3. Read the root context and its child context.
  const root = result.computeOutput("context", (a) =>
    a === undefined
      ? undefined
      : {
          id: a.id,
          data: a.getDataAsJson<Record<string, string>>(),
          children: a.listDynamicFields().filter((f) => f.startsWith("child/")),
        },
  );
  const rootValue = await root.awaitStableValue();
  expect(rootValue).toBeDefined();
  expect(rootValue!.children).toHaveLength(1);

  await pl.withReadTx("readActionContext", async (tx) => {
    const rootKV = await tx.listKeyValuesString(rootValue!.id);
    const transitions = rootKV.filter((kv) => kv.key.startsWith("transition/tpl/"));
    expect(transitions).toHaveLength(1);
    expect(JSON.parse(transitions[0].value)).toEqual({
      state: "Running",
      detail: "root body",
      reason: "",
    });

    const rootData = await tx.getResourceData(rootValue!.id, true);
    const childField = rootData.fields.find((f) => f.name === rootValue!.children[0])!;
    const childContext = await tx.getResourceData(childField.value as never, false);
    const childData = JSON.parse(Buffer.from(childContext.data!).toString()) as Record<
      string,
      string
    >;
    expect(childData["name"]).eq("@platforma-sdk/workflow-tengo-tests:action-context.child");

    // the child context also has the backend's own WaitingForInputs transition under "core"
    const childKV = await tx.listKeyValuesString(childField.value as never);
    const attrs = childKV.filter((kv) => kv.key.startsWith("reading/"));
    expect(attrs.map((kv) => kv.value)).toEqual(["40"]);
    expect(attrs[0].key).toMatch(/^reading\/exec\/[^/]+\/progress\/[0-9a-f]{16}$/);
  });
});
