import { tplTest } from "@platforma-sdk/test";

tplTest.concurrent("block status from templates", async ({ helper, expect, pl }) => {
  //
  // Scenario:
  //  1. Render the root template: it creates its status context, records "Running" and renders
  //     a child template, which sets an attribute.
  //  2. Without statusApi on the backend: the calls are no-ops and both templates still finish.
  //  3. With statusApi: the root context has the transition and the template name of a child context;
  //     the child context has the attribute.
  //

  const result = await helper.renderTemplate(
    true,
    "status.status",
    ["status", "child"],
    () => ({}),
  );

  // 1. Both templates finish.
  const child = result.computeOutput("child", (a) => a?.getDataAsJson());
  expect(await child.awaitStableValue()).eq("ok");

  // 2. Without statusApi, nothing else to check.
  if (!pl.hasCapability("statusApi:v1")) return;

  // 3. Read the root context and its child context.
  const root = result.computeOutput("status", (a) =>
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

  await pl.withReadTx("readStatus", async (tx) => {
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
    expect(childData["name"]).eq("@platforma-sdk/workflow-tengo-tests:status.child");

    // the child context also has the backend's own WaitingForInputs transition under "core"
    const childKV = await tx.listKeyValuesString(childField.value as never);
    const attrs = childKV.filter((kv) => kv.key.startsWith("attr/"));
    expect(attrs.map((kv) => kv.value)).toEqual(["40"]);
    expect(attrs[0].key).toMatch(/^attr\/exec\/[^/]+\/progress\/[0-9a-f]{16}$/);
  });
});
