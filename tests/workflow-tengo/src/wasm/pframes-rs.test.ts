import { tplTest } from "@platforma-sdk/test";

// Integration smoke test for the @milaboratories/pframes-rs-wasip2
// wasm component. The template uses assets.importWasm directly — no
// SDK wrapper. tengo-builder bundles the component, the workflow
// controller precompiles + pins it, and frame.buildQuery returns the
// expected JSON string.
tplTest.concurrent(
  "pframes-rs-wasip2 — frame.buildQuery returns the expected JSON",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability("wasm:v1")) {
      skip();
      return;
    }
    const result = await helper.renderTemplate(
      false,
      "wasm.pframes-rs",
      ["resultJson"],
      () => ({}),
    );

    const out = await result
      .computeOutput("resultJson", (a) => a?.getDataAsJson())
      .awaitStableValue();

    expect(typeof out).toBe("string");
    expect(out as string).toEqual('{"entry":{"type":"column","column":"abundance"}}');
  },
);
