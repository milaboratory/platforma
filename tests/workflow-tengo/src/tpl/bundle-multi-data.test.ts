import { Pl, field, resourceType, toGlobalResourceId } from "@milaboratories/pl-middle-layer";
import type { ResourceId } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";
import { Templates } from "../..";

// The backend links a multi-hit query result's data map one transaction after its spec map. A template
// awaiting PColumnBundle must not run in between: it reads the data map of every multi-hit result.

const REFS = ["c1", "c2"].map((name) => JSON.stringify({ blockId: "b1", name }));

tplTest.concurrent(
  "PColumnBundle: a template runs once the multi-hit data map links, without waiting for single-hit data",
  async ({ pl, helper, expect }) => {
    const created: { pending?: ResourceId } = {};

    const result = await helper.renderTemplate(
      true,
      Templates["tpl.bundle-multi-data"],
      ["first", "second"],
      async (tx) => {
        // Stands in for the GetField that links the resolver's data map.
        const pending = tx.createStruct(resourceType("TestPending", "1"));
        tx.createField(field(pending, "dataMap"), "Input");
        tx.createField(field(pending, "upstreamData"), "Input");

        const specMap = tx.createStruct(Pl.StdMap);
        for (const ref of REFS) {
          tx.createField(field(specMap, ref), "Input");
          tx.setField(field(specMap, ref), tx.createValue(Pl.JsonObject, JSON.stringify({ ref })));
        }
        tx.lockInputs(specMap);

        // As `bquery.create` builds a multi-hit result with data: `data` and `multiData` share one future.
        const multi = tx.createStruct(resourceType("BQueryResult", "1"));
        tx.createField(field(multi, "ops"), "Input");
        tx.setField(
          field(multi, "ops"),
          tx.createValue(
            Pl.JsonObject,
            JSON.stringify({ spec: true, data: true, first: false, single: false }),
          ),
        );
        tx.createField(field(multi, "spec"), "Input");
        tx.setField(field(multi, "spec"), specMap);
        for (const name of ["data", "multiData"]) {
          tx.createField(field(multi, name), "Input");
          tx.setField(field(multi, name), field(pending, "dataMap"));
        }
        tx.lockInputs(multi);

        // A single-hit result whose upstream data is still computing.
        const single = tx.createStruct(resourceType("BQueryResult", "1"));
        tx.createField(field(single, "ops"), "Input");
        tx.setField(
          field(single, "ops"),
          tx.createValue(
            Pl.JsonObject,
            JSON.stringify({ spec: true, data: true, first: true, single: true }),
          ),
        );
        tx.createField(field(single, "ref"), "Input");
        tx.setField(field(single, "ref"), tx.createValue(Pl.JsonObject, REFS[0]));
        tx.createField(field(single, "spec"), "Input");
        tx.setField(
          field(single, "spec"),
          tx.createValue(Pl.JsonObject, JSON.stringify({ ref: REFS[0] })),
        );
        tx.createField(field(single, "data"), "Input");
        tx.setField(field(single, "data"), field(pending, "upstreamData"));
        tx.lockInputs(single);

        const bundle = tx.createStruct(resourceType("PColumnBundle", "1"));
        for (const [key, value] of [
          ["multi", multi],
          ["single", single],
        ] as const) {
          tx.createField(field(bundle, key), "Input");
          tx.setField(field(bundle, key), value);
        }
        tx.lockInputs(bundle);

        created.pending = await toGlobalResourceId(pending);
        return { columns: await toGlobalResourceId(bundle) };
      },
    );

    const pending = created.pending;
    if (pending === undefined) {
      throw new Error("the template inputs were not created");
    }
    const first = result.computeOutput("first", (a) => a?.getDataAsJson());
    const second = result.computeOutput("second", (a) => a?.getDataAsJson());

    // A template that does not wait would run, and fail to read the unset data map, well within this time.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await first.refreshState();
    expect(await first.getValue()).toBeUndefined();

    // The data map links; single-hit upstream data stays unset for the whole test.
    await pl.withWriteTx("Test", async (tx) => {
      const dataMap = tx.createStruct(Pl.StdMap);
      for (const [index, ref] of REFS.entries()) {
        tx.createField(field(dataMap, ref), "Input");
        tx.setField(
          field(dataMap, ref),
          tx.createValue(Pl.JsonObject, JSON.stringify(`data${index + 1}`)),
        );
      }
      tx.lockInputs(dataMap);
      tx.setField(field(pending, "dataMap"), dataMap);
      await tx.commit();
    });

    expect(await first.awaitStableValue()).eq("data1");
    expect(await second.awaitStableValue()).eq("data2");
  },
);
