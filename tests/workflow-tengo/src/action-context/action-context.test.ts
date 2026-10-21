import type { PlClient, PlTransaction, SignedResourceId } from "@milaboratories/pl-client";
import { tplTest } from "@platforma-sdk/test";

type ActionContextNode = {
  baggage: Record<string, string>;
  kv: { key: string; value: string }[];
  /** The resource of the render/Running transition the workflow controller records: the render. */
  renderResource?: string;
  children: ActionContextNode[];
};

/** Block action context needs the backend primitives: optional service fields and async KV sets. */
function hasActionContextPrimitives(pl: PlClient): boolean {
  const capabilities = (pl.serverInfo.capabilities ?? []) as readonly string[];
  return capabilities.includes("optionalServiceField:v1") && capabilities.includes("kvAsync:v1");
}

async function readActionContextNode(
  tx: PlTransaction,
  contextRef: SignedResourceId,
): Promise<ActionContextNode> {
  const context = await tx.getResourceData(contextRef, true);
  const kv = await tx.listKeyValuesString(contextRef);
  const children: ActionContextNode[] = [];
  for (const field of context.fields) {
    if (field.name.startsWith("child/"))
      children.push(await readActionContextNode(tx, field.value));
  }
  const render = kv.find((e) => e.key.startsWith("transition/render/"));
  return {
    baggage: JSON.parse(Buffer.from(context.data!).toString()) as Record<string, string>,
    kv,
    renderResource: render?.key.split("/")[2],
    children,
  };
}

function transitions(node: ActionContextNode, namespace: string): unknown[] {
  return node.kv
    .filter((e) => e.key.startsWith(`transition/${namespace}/`))
    .map((e) => JSON.parse(e.value) as unknown);
}

tplTest.concurrent("block action context tree from templates", async ({ helper, expect, pl }) => {
  //
  // Scenario:
  //  1. Render the root template: it creates its own action context with baggage, records "Running"
  //     and renders a child. The child records "Running", sets an reading and renders a grandchild
  //     with a custom name. The grandchild records "Completed". All three finish.
  //  2. The tree: root -> child -> grandchild, linked by child/ fields. Each child copies the baggage
  //     of its parent (block-id, run-id) and has its own name: the template name by default.
  //  3. The contexts of the child and the grandchild have the render/Running transition of their
  //     render, which the workflow controller records. Every context has the reports of its template.
  //  Without the backend primitives the templates create no contexts, so the test has nothing to check.
  //

  if (!hasActionContextPrimitives(pl)) return;

  const result = await helper.renderTemplate(
    true,
    "action-context.tree",
    ["context", "child", "childBaggage"],
    () => ({}),
  );

  // 1. All three templates finish.
  const child = result.computeOutput("child", (a) => a?.getDataAsJson());
  expect(await child.awaitStableValue()).eq("ok");

  // 2. The tree, its baggage and its links.
  const rootRef = await result.computeOutput("context", (a) => a?.id).awaitStableValue();
  expect(rootRef).toBeDefined();

  const root = await pl.withReadTx("readActionContext", async (tx) =>
    readActionContextNode(tx, rootRef!),
  );
  expect(root.baggage).toEqual({ name: "root", "block-id": "block-1", "run-id": "run-1" });
  expect(root.children).toHaveLength(1);

  const childNode = root.children[0];
  expect(childNode.baggage).toEqual({
    name: "@platforma-sdk/workflow-tengo-tests:action-context.child",
    "block-id": "block-1",
    "run-id": "run-1",
  });
  expect(childNode.children).toHaveLength(1);

  const grandchildNode = childNode.children[0];
  expect(grandchildNode.baggage).toEqual({
    name: "custom grandchild",
    "block-id": "block-1",
    "run-id": "run-1",
  });
  expect(grandchildNode.children).toHaveLength(0);

  // A template reads the baggage of its own context: the child sees the copy of the root baggage.
  expect(
    await result.computeOutput("childBaggage", (a) => a?.getDataAsJson()).awaitStableValue(),
  ).toEqual(childNode.baggage);

  // 3. The controller transitions name the renders; the reports of the templates.
  for (const node of [childNode, grandchildNode])
    expect(transitions(node, "render")).toContainEqual({
      state: "Running",
      detail: "init",
      reason: "",
    });
  expect(childNode.renderResource).toBeDefined();
  expect(grandchildNode.renderResource).toBeDefined();
  expect(childNode.renderResource).not.toEqual(grandchildNode.renderResource);

  expect(transitions(root, "tpl")).toEqual([{ state: "Running", detail: "root body", reason: "" }]);
  expect(transitions(childNode, "tpl")).toEqual([
    { state: "Running", detail: "child body", reason: "" },
  ]);
  expect(transitions(grandchildNode, "tpl")).toEqual([
    { state: "Completed", detail: "", reason: "" },
  ]);

  const attrs = childNode.kv.filter((e) => e.key.startsWith("reading/"));
  expect(attrs.map((e) => e.value)).toEqual(["40"]);
  expect(attrs[0].key).toEqual(`reading/exec/${childNode.renderResource}/progress`);
});

tplTest.concurrent(
  "block action context is a no-op without an action context",
  async ({ helper, expect }) => {
    //
    // Scenario:
    //  1. Render a template without an action context: it reports, and renders a child.
    //  2. Both finish, and neither the template nor its child has an action context.
    //

    const result = await helper.renderTemplate(
      true,
      "action-context.nocontext",
      ["contexts", "child"],
      () => ({}),
    );

    expect(await result.computeOutput("child", (a) => a?.getDataAsJson()).awaitStableValue()).eq(
      "ok",
    );
    expect(
      await result.computeOutput("contexts", (a) => a?.getDataAsJson()).awaitStableValue(),
    ).toEqual({ own: "none", child: "none" });
  },
);

tplTest.concurrent(
  "block action context sinkhole drops the subtree below a render",
  async ({ helper, expect, pl }) => {
    //
    // Scenario:
    //  1. Render a template with its own context; it renders a child with { actionContext: false }.
    //  2. The child is in the sinkhole: it cannot create its own context, and the template it renders
    //     is in the sinkhole too. Both finish.
    //  3. The root context has no child context, and none of the child's reports.
    //  Without the backend primitives nothing has a context, so the test has nothing to check.
    //

    if (!hasActionContextPrimitives(pl)) return;

    const result = await helper.renderTemplate(
      true,
      "action-context.sinkhole",
      ["context", "info", "done"],
      () => ({}),
    );

    // 1-2. Everything finishes; the child and its child are in the sinkhole.
    expect(await result.computeOutput("done", (a) => a?.getDataAsJson()).awaitStableValue()).eq(
      "ok",
    );
    expect(
      await result.computeOutput("info", (a) => a?.getDataAsJson()).awaitStableValue(),
    ).toEqual({ created: false, baggage: false, own: "sinkhole", grandchild: "sinkhole" });

    // 3. The root context does not know the child.
    const rootRef = await result.computeOutput("context", (a) => a?.id).awaitStableValue();
    const root = await pl.withReadTx("readActionContext", async (tx) =>
      readActionContextNode(tx, rootRef!),
    );
    expect(root.baggage).toEqual({ name: "root", "run-id": "run-2" });
    expect(root.children).toEqual([]);
    expect(transitions(root, "tpl")).toEqual([{ state: "Running", detail: "root body", reason: "" }]);
    expect(root.kv.filter((e) => e.key.startsWith("reading/"))).toEqual([]);
  },
);
