import { BackendCapability, Pl, stringifyJson } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";

// Integration smoke test for `@platforma-sdk/workflow-tengo:pframes-rs`.
// Drives the SDK wrapper end-to-end: tengo-builder bundles the
// @milaboratories/pframes-rs-wasip2 component via the wrapper's
// `assets.importWasm` marker, the workflow controller precompiles +
// caches it, and the wrapper's `frame.buildQuery` round-trips a Tengo
// map through JSON to the WIT call.
tplTest.concurrent(
  "pframes-rs wrapper — frame.buildQuery round-trips through the wasm bridge",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability(BackendCapability.WasmV1)) {
      skip();
      return;
    }
    const req = { version: "v1", column: "abundance" };
    const result = await helper.renderTemplate(true, "wasm.pframes-rs", ["resultJson"], (tx) => ({
      req: tx.createValue(Pl.JsonObject, stringifyJson(req)),
    }));

    const out = await result
      .computeOutput("resultJson", (a) => a?.getDataAsJson())
      .awaitStableValue();

    expect(typeof out).toBe("string");
    expect(out as string).toEqual('{"entry":{"type":"column","column":"abundance"}}');
  },
);
