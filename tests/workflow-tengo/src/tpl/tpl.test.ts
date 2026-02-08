import { Pl } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";

tplTest.concurrent("test simple template", async ({ helper, expect }) => {
  const result = await helper.renderTemplate(false, "tpl.simple1", ["main"], (tx) => ({
    input1: tx.createValue(Pl.JsonObject, JSON.stringify({ testValue: "Truman" })),
  }));
  const mainResult = result.computeOutput("main", (a) => a?.getDataAsJson());
  expect(await mainResult.awaitStableValue()).eq("Truman Show");
});

tplTest.concurrent("test template with maps output", async ({ helper, expect }) => {
  const result = await helper.renderTemplate(
    false,
    "tpl.map-outputs",
    ["simpleMap"],
    (_tx) => ({}),
  );

  const simpleMap = (await result
    .computeOutput("simpleMap", (a) => a?.getDataAsJson())
    .awaitStableValue()) as Record<string, string>;
  expect(simpleMap["a"]).eq("a");
});

tplTest.concurrent("test template json encoded strings in keys", async ({ helper, expect }) => {
  const key = '{"a":"b"}';
  const result = await helper.renderTemplate(false, "tpl.json-keys", [key], (_tx) => ({}));

  const r = await result.computeOutput(key, (a) => a?.getDataAsJson()).awaitStableValue();
  console.dir(r, { depth: 5 });
  expect(r).eq("a");
});
