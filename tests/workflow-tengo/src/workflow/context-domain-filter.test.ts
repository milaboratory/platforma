import {
  awaitStableState,
  ML,
  TestWorkflowResults,
  TplTestHelpers,
  tplTest,
} from "@platforma-sdk/test";

const SETUP_TEMPLATE = "workflow.context-domain-filter.setup";
const QUERY_TEMPLATE = "workflow.context-domain-filter.query";

/** Render setup workflow exporting 3 PColumns with distinct contextDomain values. */
async function setupContext(helper: TplTestHelpers) {
  const setup = await helper.renderWorkflow(SETUP_TEMPLATE, false, {}, { blockId: "b1" });
  return await awaitStableState(setup.context());
}

/** Run a contextDomain query against the setup context. */
async function runQuery(
  helper: TplTestHelpers,
  ctx: ML.ResourceId,
  query: Record<string, unknown>,
  opts: { rawOnly?: boolean } = {},
) {
  return helper.renderWorkflow(
    QUERY_TEMPLATE,
    false,
    { query, ...opts },
    { parent: ctx, blockId: "b2" },
  );
}

/** Number of specs matched by a multi-result query. */
async function awaitMatchCount(qWf: TestWorkflowResults): Promise<number> {
  const fields = await awaitStableState(
    qWf.output("r1Spec", (a) => {
      if (!a?.getIsReadyOrError()) return undefined;
      return a.listInputFields();
    }),
  );
  return fields?.length ?? 0;
}

/** Parsed spec from a single-result query (first/single mode). */
async function awaitMatchedSpec(qWf: TestWorkflowResults) {
  return awaitStableState(
    qWf.output("r1Spec", (a) => a?.getDataAsJson<{ contextDomain?: Record<string, string> }>()),
  );
}

/** Whether the query result is NoResult (no match in single mode). */
async function awaitIsNoResult(qWf: TestWorkflowResults): Promise<boolean> {
  const typeName = await awaitStableState(
    qWf.output("r1", (a, c) => {
      if (!a?.getIsReadyOrError()) {
        c.markUnstable("not_ready");
        return undefined;
      }
      return a.getField("ref")?.value?.resourceType?.name;
    }),
  );
  return typeName?.includes("NoResult") ?? false;
}

tplTest.concurrent(
  "contextDomain filter: multi-result returns only matching columns",
  async ({ helper, expect }) => {
    const ctx = await setupContext(helper);
    const qWf = await runQuery(helper, ctx, {
      name: "pl7.app/cdtest",
      contextDomain: { species: "human" },
      matchStrategy: "expectMultiple",
    });

    expect(await awaitMatchCount(qWf)).eq(2);
  },
);

tplTest.concurrent(
  "contextDomain filter: single result with exact contextDomain match",
  async ({ helper, expect }) => {
    const ctx = await setupContext(helper);
    const qWf = await runQuery(helper, ctx, {
      name: "pl7.app/cdtest",
      contextDomain: { species: "human", tissue: "blood" },
    });

    const spec = await awaitMatchedSpec(qWf);
    expect(spec).toBeDefined();
    expect(spec!.contextDomain).toMatchObject({
      species: "human",
      tissue: "blood",
    });
  },
);

tplTest.concurrent(
  "contextDomain filter: no match returns empty result",
  async ({ helper, expect }) => {
    const ctx = await setupContext(helper);
    const qWf = await runQuery(helper, ctx, {
      name: "pl7.app/cdtest",
      contextDomain: { species: "rat" },
      matchStrategy: "expectMultiple",
    });

    expect(await awaitMatchCount(qWf)).eq(0);
  },
);

tplTest.concurrent(
  "contextDomain filter: no match in single mode returns NoResult",
  async ({ helper, expect }) => {
    const ctx = await setupContext(helper);
    const qWf = await runQuery(
      helper,
      ctx,
      { name: "pl7.app/cdtest", contextDomain: { species: "rat" } },
      { rawOnly: true },
    );

    expect(await awaitIsNoResult(qWf)).toBe(true);
  },
);

tplTest.concurrent(
  "contextDomain filter: axis-level contextDomain with partial match",
  async ({ helper, expect }) => {
    const ctx = await setupContext(helper);
    const qWf = await runQuery(helper, ctx, {
      name: "pl7.app/cdtest",
      contextDomain: { species: "mouse" },
      axes: [
        {
          name: "pl7.app/sampleId",
          type: "String",
          contextDomain: { species: "mouse" },
        },
      ],
      partialAxesMatch: true,
      matchStrategy: "expectMultiple",
    });

    expect(await awaitMatchCount(qWf)).eq(1);
  },
);

tplTest.concurrent(
  "contextDomain filter: axis-level contextDomain with positional match",
  async ({ helper, expect }) => {
    const ctx = await setupContext(helper);
    const qWf = await runQuery(helper, ctx, {
      name: "pl7.app/cdtest",
      contextDomain: { species: "mouse" },
      axes: [
        {
          name: "pl7.app/sampleId",
          type: "String",
          contextDomain: { species: "mouse" },
        },
      ],
      matchStrategy: "expectMultiple",
    });

    expect(await awaitMatchCount(qWf)).eq(1);
  },
);
