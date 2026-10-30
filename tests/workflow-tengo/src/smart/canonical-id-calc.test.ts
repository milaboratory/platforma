import { field, Pl, resourceType } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";

type CidPair = { backend: string; calculated: string };

/*
 * The ll.canonical-id library calculates canonical IDs on the template level for old backends.
 * On a current backend, the calculated canonical ID must be equal to the one from the backend:
 * for value resources (JSON and binary data), for a structural resource, and for the renderer.
 */
tplTest.concurrent("calculated canonical ids match the backend", async ({ helper, expect }) => {
  const result = await helper.renderTemplate(false, "smart.canonical-id-calc", ["cids"], (tx) => {
    const struct = tx.createStruct(
      resourceType("PColumnData/ResourceMap", "1"),
      JSON.stringify({ keyLength: 1 }),
    );
    // Names are not in insertion order: the hash must sort them as the backend does.
    tx.createField(field(struct, "[2]"), "Input", tx.createValue(Pl.JsonObject, '{"b":2,"a":1}'));
    tx.createField(field(struct, "[10]"), "Input", tx.createValue(Pl.RNull, ""));
    tx.createField(field(struct, "[1]"), "Input", tx.createValue(Pl.JsonObject, "[1,2,3]"));
    tx.lockInputs(struct);

    return {
      json: tx.createValue(Pl.JsonObject, JSON.stringify({ z: "last", a: "first" })),
      binary: tx.createValue(resourceType("TestValue", "1"), new Uint8Array([0, 1, 2, 255])),
      struct,
    };
  });

  const cids = await result
    .computeOutput("cids", (a) => a?.getDataAsJson<Record<string, CidPair>>())
    .awaitStableValue();

  expect(Object.keys(cids ?? {}).sort()).toEqual(["binary", "json", "renderer", "struct"]);
  for (const [name, pair] of Object.entries(cids ?? {})) {
    expect(pair.backend, name).toMatch(/^[0-9a-f]{32}$/);
    expect(pair.calculated, name).eq(pair.backend);
  }
});
