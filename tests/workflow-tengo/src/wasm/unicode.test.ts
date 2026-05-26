import { BackendCapability } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";

// Unicode round-trip. Column names spanning emoji, RTL Arabic, CJK,
// spaces, and mixed scripts must survive the JSON encode → host →
// wasm → JSON decode → guest comparison → JSON encode → host → JSON
// decode → Tengo path byte-for-byte. Any byte-level mangling would
// turn a successful lookup into a miss.
tplTest.concurrent(
  "assets.importWasm — Unicode column names round-trip cleanly",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability(BackendCapability.WasmV1)) {
      skip();
      return;
    }

    const result = await helper.renderTemplate(
      false,
      "wasm.unicode",
      ["emoji", "arabic", "cjk", "spaced", "mixed"],
      () => ({}),
    );

    const [emoji, arabic, cjk, spaced, mixed] = await Promise.all([
      result.computeOutput("emoji", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("arabic", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("cjk", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("spaced", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("mixed", (a) => a?.getDataAsJson()).awaitStableValue(),
    ]);

    // Each lookup returns ColumnInfo JSON whose `name` field exactly
    // matches the queried name. The guest serde drops escaping back to
    // the raw characters, so the JSON snippet contains the literal name
    // unless something on the bridge re-encoded it.
    expect(emoji as string).toContain('"🧬"');
    expect(arabic as string).toContain('"عمود"');
    expect(cjk as string).toContain('"列"');
    expect(spaced as string).toContain('"col with space"');
    expect(mixed as string).toContain('"mix🚀tures✨"');

    // All lookups should also report the expected type field, proving
    // the rest of the record survived alongside the name.
    expect(emoji as string).toContain('"i32"');
    expect(arabic as string).toContain('"string"');
    expect(cjk as string).toContain('"i64"');
    expect(spaced as string).toContain('"f64"');
    expect(mixed as string).toContain('"u8"');
  },
);
