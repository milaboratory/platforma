import type { ResourceId } from "@milaboratories/pl-middle-layer";
import { Pl, field, resourceType, toGlobalResourceId } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";

// A multi-result query links its data map twice, as `data` and as `dataMap`; the two links resolve
// separately. The PColumnBundle state awaits `dataMap`, so a template body that reads the bundle runs
// only once the map is linked there, for either resolver family, and reads it from `dataMap` even
// while `data` is still unset.

const SPEC = { kind: "PColumn", name: "pl7.app/test", valueType: "String", axesSpec: [] };
const DATA = { some: "data" };

tplTest.concurrent.for([
  { family: 1, ref: { blockId: "block-1", name: "column-1" } },
  { family: 2, ref: { blockId: "block-1/main", name: "column-1" } },
])(
  "PColumnBundle state awaits the data map of a multi-result query (family $family)",
  async ({ family, ref }, { pl, helper, expect }) => {
    const refKey = JSON.stringify(ref);
    const ops = {
      spec: true,
      data: true,
      single: false,
      first: false,
      errIfMissing: false,
      ...(family === 2 ? { family: 2 } : {}),
    };
    const ids: { queryResult?: ResourceId } = {};

    const result = await helper.renderTemplate(
      true,
      "workflow.query-result-pending-data.bundle",
      ["count", "name", "data"],
      async (tx) => {
        const queryResult = tx.createStruct(resourceType("BQueryResult", "1"));
        tx.createField(
          field(queryResult, "ops"),
          "Input",
          tx.createValue(Pl.JsonObject, JSON.stringify(ops)),
        );
        tx.createField(
          field(queryResult, "spec"),
          "Input",
          Pl.createPlMap(
            tx,
            { [refKey]: tx.createValue(Pl.JsonObject, JSON.stringify(SPEC)) },
            false,
          ),
        );
        // both links of the data map come later
        tx.createField(field(queryResult, "data"), "Input");
        tx.createField(field(queryResult, "dataMap"), "Input");
        tx.lock(queryResult);
        ids.queryResult = await toGlobalResourceId(queryResult);

        return {
          bundle: Pl.createPlMap(tx, { q: queryResult }, false, resourceType("PColumnBundle", "1")),
        };
      },
    );

    const count = result.computeOutput("count", (a) => a?.getDataAsJson());
    const name = result.computeOutput("name", (a) => a?.getDataAsJson());
    const data = result.computeOutput("data", (a) => a?.getDataAsJson());

    // the specs are ready, the data map is not linked: the body does not run. Family 1 would not
    // fail without the await (its items would get futures), so give the render time to happen.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await count.refreshState();
    expect(await count.getValue()).toBeUndefined();

    const queryResult = ids.queryResult;
    if (queryResult === undefined) throw new Error("the query result was not created");

    // link the map as `dataMap` only; `data` stays unset
    await pl.withWriteTx("Test", async (tx) => {
      tx.setField(
        field(queryResult, "dataMap"),
        Pl.createPlMap(
          tx,
          { [refKey]: tx.createValue(Pl.JsonObject, JSON.stringify(DATA)) },
          false,
        ),
      );
      await tx.commit();
    });

    await count.refreshState();
    expect(await count.awaitStableValue()).eq(1);
    await name.refreshState();
    expect(await name.awaitStableValue()).eq(SPEC.name);
    await data.refreshState();
    expect(await data.awaitStableValue()).toStrictEqual(DATA);
  },
);
