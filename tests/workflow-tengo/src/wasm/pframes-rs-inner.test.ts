import { tplTest } from "@platforma-sdk/test";

// Theory probe: wasm.pframes-rs.tpl.tengo calls assets.importWasm in the
// rendered template's own body and passes. wasm.pframes-rs-inner renders
// an inner template (wasm.pframes-rs-inner-body) via render.create whose
// body makes the identical wasm call — same wasm bytes, same alias, same
// pack — and the call should produce the same JSON string.
//
// Observed in rarefaction: when wasm-using code lives in a template
// reached through a nested render rather than the top-level rendered
// template, plapi.loadWasm aborts the script with "alias … is not a wasm
// dependency of this template". The per-render Wasm map the workflow
// controller builds at compileTemplate time appears to be scoped to the
// outermost template only — inner renders see an empty Wasm map even
// though tengo-builder bundles the wasm bytes into the pack.
//
// This test is the minimal reproduction in the integration suite: if it
// fails the same way rarefaction does, that confirms the bug is generic
// to render.create + wasm-using inner templates and is the right place
// to fix the dep propagation. If it passes, the bug lives somewhere in
// the block-pack → controller path that this test bypasses, and the
// repro needs to add another layer.
tplTest.concurrent(
  "pframes-rs-wasip2 — wasm call inside an inner render.create template",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability("wasm:v1")) {
      skip();
      return;
    }
    const result = await helper.renderTemplate(
      false,
      "wasm.pframes-rs-inner",
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
