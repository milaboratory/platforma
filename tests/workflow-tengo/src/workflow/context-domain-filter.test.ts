import { awaitStableState, ML, TestWorkflowResults, tplTest } from "@platforma-sdk/test";

const SETUP_TEMPLATE = "workflow.context-domain-filter.setup";
const QUERY_TEMPLATE = "workflow.context-domain-filter.query";

const DEFAULT_COLUMN_SPEC: ML.PColumnSpec = {
  kind: "PColumn",
  name: "pl7.app/cdtest",
  valueType: "String",
  domain: { "pl7.app/block": "b1" },
  axesSpec: [
    {
      name: "pl7.app/sampleId",
      type: "String",
      domain: {},
    },
  ],
};

interface ColumnSpecOverride {
  contextDomain: ML.Metadata;
  axesSpec?: { contextDomain: ML.Metadata }[];
}

function columnSpec(override: ColumnSpecOverride): ML.PColumnSpec {
  return {
    ...DEFAULT_COLUMN_SPEC,
    contextDomain: override.contextDomain,
    axesSpec: DEFAULT_COLUMN_SPEC.axesSpec.map((axis, i) => ({
      ...axis,
      contextDomain: override.axesSpec?.[i]?.contextDomain ?? override.contextDomain,
    })),
  };
}

const TEST_COLUMNS: Record<string, ML.PColumnSpec> = {
  humanBlood: columnSpec({
    contextDomain: { species: "human", tissue: "blood" },
    axesSpec: [{ contextDomain: { species: "human" } }],
  }),
  humanLung: columnSpec({
    contextDomain: { species: "human", tissue: "lung" },
    axesSpec: [{ contextDomain: { species: "human" } }],
  }),
  mouse: columnSpec({
    contextDomain: { species: "mouse" },
  }),
};

const cdTest = tplTest.extend<{
  parentContext: ML.ResourceId;
  runQuery: (
    query: Record<string, unknown>,
    opts?: { rawOnly?: boolean },
  ) => Promise<TestWorkflowResults>;
}>({
  parentContext: async ({ helper }, use) => {
    const setup = await helper.renderWorkflow(
      SETUP_TEMPLATE,
      false,
      { columns: TEST_COLUMNS },
      { blockId: "b1" },
    );
    await use(await awaitStableState(setup.context()));
  },
  runQuery: async ({ helper, parentContext }, use) => {
    await use((query, opts = {}) =>
      helper.renderWorkflow(
        QUERY_TEMPLATE,
        false,
        { query, ...opts },
        { parent: parentContext, blockId: "b2" },
      ),
    );
  },
});

async function awaitMatchedColumnCount(queryResult: TestWorkflowResults): Promise<number> {
  const fields = await awaitStableState(
    queryResult.output("resultSpec", (accessor) => {
      if (!accessor?.getIsReadyOrError()) return undefined;
      return accessor.listInputFields();
    }),
  );
  return fields?.length ?? 0;
}

async function awaitMatchedColumnSpec(
  queryResult: TestWorkflowResults,
): Promise<Pick<ML.PColumnSpec, "contextDomain"> | undefined> {
  return awaitStableState(
    queryResult.output("resultSpec", (accessor) =>
      accessor?.getDataAsJson<Pick<ML.PColumnSpec, "contextDomain">>(),
    ),
  );
}

async function awaitIsNoResult(queryResult: TestWorkflowResults): Promise<boolean> {
  const typeName = await awaitStableState(
    queryResult.output("result", (accessor, computable) => {
      if (!accessor?.getIsReadyOrError()) {
        computable.markUnstable("not_ready");
        return undefined;
      }
      return accessor.getField("ref")?.value?.resourceType?.name;
    }),
  );
  return typeName?.includes("NoResult") ?? false;
}

cdTest.concurrent(
  "contextDomain filter: multi-result returns only matching columns",
  async ({ runQuery, expect }) => {
    const queryResult = await runQuery({
      name: "pl7.app/cdtest",
      contextDomain: { species: "human" },
      matchStrategy: "expectMultiple",
    });

    expect(await awaitMatchedColumnCount(queryResult)).eq(2);
  },
);

cdTest.concurrent(
  "contextDomain filter: single result with exact contextDomain match",
  async ({ runQuery, expect }) => {
    const queryResult = await runQuery({
      name: "pl7.app/cdtest",
      contextDomain: { species: "human", tissue: "blood" },
    });

    const spec = await awaitMatchedColumnSpec(queryResult);
    expect(spec).toBeDefined();
    expect(spec!.contextDomain).toMatchObject({
      species: "human",
      tissue: "blood",
    });
  },
);

cdTest.concurrent(
  "contextDomain filter: no match returns empty result",
  async ({ runQuery, expect }) => {
    const queryResult = await runQuery({
      name: "pl7.app/cdtest",
      contextDomain: { species: "rat" },
      matchStrategy: "expectMultiple",
    });

    expect(await awaitMatchedColumnCount(queryResult)).eq(0);
  },
);

cdTest.concurrent(
  "contextDomain filter: no match in single mode returns NoResult",
  async ({ runQuery, expect }) => {
    const queryResult = await runQuery(
      { name: "pl7.app/cdtest", contextDomain: { species: "rat" } },
      { rawOnly: true },
    );

    expect(await awaitIsNoResult(queryResult)).toBe(true);
  },
);

cdTest.concurrent(
  "contextDomain filter: axis-level contextDomain with partial match",
  async ({ runQuery, expect }) => {
    const queryResult = await runQuery({
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

    expect(await awaitMatchedColumnCount(queryResult)).eq(1);
  },
);

cdTest.concurrent(
  "contextDomain filter: axis-level contextDomain with positional match",
  async ({ runQuery, expect }) => {
    const queryResult = await runQuery({
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

    expect(await awaitMatchedColumnCount(queryResult)).eq(1);
  },
);
