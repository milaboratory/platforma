import { awaitStableState, ML, tplTest } from "@platforma-sdk/test";

const AWAIT_TIMEOUT = 30_000;

const COLUMN_SPEC: ML.PColumnSpec = {
  kind: "PColumn",
  name: "pl7.app/multiDataTest",
  valueType: "String",
  axesSpec: [{ name: "pl7.app/sampleId", type: "String" }],
};

// PColumnBundle awaits `multiData`, the field a multi-hit result's data map is read from.
tplTest.concurrent.for([
  { specOnly: false, hasMultiData: true },
  { specOnly: true, hasMultiData: false },
])(
  "bquery: a multi-hit query result has the multiData field when it fetches data (specOnly $specOnly)",
  async ({ specOnly, hasMultiData }, { helper, expect }) => {
    const setup = await helper.renderWorkflow(
      "workflow.context-domain-filter.setup",
      false,
      { columns: { a: COLUMN_SPEC, b: COLUMN_SPEC } },
      { blockId: "b1" },
    );
    const parent = await awaitStableState(setup.context(), AWAIT_TIMEOUT);

    const query = await helper.renderWorkflow(
      "workflow.context-domain-filter.query",
      false,
      {
        query: { name: COLUMN_SPEC.name, matchStrategy: "expectMultiple" },
        specOnly,
        rawOnly: true,
      },
      { parent, blockId: "b2" },
    );
    const fields = await awaitStableState(
      query.output("result", (a) => a?.listInputFields()),
      AWAIT_TIMEOUT,
    );

    expect(fields?.includes("multiData")).toBe(hasMultiData);
  },
);
