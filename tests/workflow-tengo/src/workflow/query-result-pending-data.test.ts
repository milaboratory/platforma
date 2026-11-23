import type { ResourceId } from "@milaboratories/pl-middle-layer";
import { Pl, field, resourceType, toGlobalResourceId } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";

// A multi-result query (`first: false`) gets its `spec` and `data` maps through separate future
// fields, so `data` can still be unset when the specs are ready. A template that awaits only the
// specs must be able to read such a result: the items carry a future of their data.

const REF = { blockId: "block-1", name: "column-1" };
const REF_KEY = JSON.stringify(REF);
const SPEC = { kind: "PColumn", name: "pl7.app/test", valueType: "String", axesSpec: [] };
const DATA = { some: "data" };
const OPS = { spec: true, data: true, single: false, first: false, errIfMissing: false };

tplTest.concurrent.for([
  { name: "in a PColumnBundle", template: "workflow.query-result-pending-data.bundle" },
  { name: "as a template input", template: "workflow.query-result-pending-data.direct" },
])(
  "multi-result query is read while its data map is not set ($name)",
  async ({ template }, { pl, helper, expect }) => {
    const ids: { queryResult?: ResourceId } = {};

    const result = await helper.renderTemplate(
      true,
      template,
      ["count", "name", "data"],
      async (tx) => {
        const queryResult = tx.createStruct(resourceType("BQueryResult", "1"));
        tx.createField(
          field(queryResult, "ops"),
          "Input",
          tx.createValue(Pl.JsonObject, JSON.stringify(OPS)),
        );
        tx.createField(
          field(queryResult, "spec"),
          "Input",
          Pl.createPlMap(
            tx,
            { [REF_KEY]: tx.createValue(Pl.JsonObject, JSON.stringify(SPEC)) },
            false,
          ),
        );
        // the data map comes later
        tx.createField(field(queryResult, "data"), "Input");
        tx.lock(queryResult);
        ids.queryResult = await toGlobalResourceId(queryResult);

        return {
          q: queryResult,
          bundle: Pl.createPlMap(tx, { q: queryResult }, false, resourceType("PColumnBundle", "1")),
        };
      },
    );

    const count = result.computeOutput("count", (a) => a?.getDataAsJson());
    const name = result.computeOutput("name", (a) => a?.getDataAsJson());
    const data = result.computeOutput("data", (a) => a?.getDataAsJson());

    // the specs are ready, the data map is not set: the body runs and reads the specs
    await count.refreshState();
    expect(await count.awaitStableValue()).eq(1);
    await name.refreshState();
    expect(await name.awaitStableValue()).eq(SPEC.name);
    await data.refreshState();
    expect(await data.getValue()).toBeUndefined();

    const queryResult = ids.queryResult;
    if (queryResult === undefined) throw new Error("the query result was not created");

    await pl.withWriteTx("Test", async (tx) => {
      tx.setField(
        field(queryResult, "data"),
        Pl.createPlMap(
          tx,
          { [REF_KEY]: tx.createValue(Pl.JsonObject, JSON.stringify(DATA)) },
          false,
        ),
      );
      await tx.commit();
    });

    // the data of the item was a future of its entry in the data map
    await data.refreshState();
    expect(await data.awaitStableValue()).toStrictEqual(DATA);
  },
);
