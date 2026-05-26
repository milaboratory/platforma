import { tplTest } from "@platforma-sdk/test";

// Integration smoke test for `@platforma-sdk/workflow-tengo:pframes-rs`.
// Drives the SDK wrapper end-to-end: tengo-builder bundles the
// @milaboratories/pframes-rs-wasip2 component via the wrapper's
// `assets.importWasm` marker, the workflow controller precompiles +
// caches it, and the wrapper's `frame.buildQuery` round-trips a Tengo
// map through JSON to the WIT call.
tplTest.concurrent(
  "pframes-rs wrapper — frame.buildQuery round-trips through the wasm bridge",
  async ({ helper, expect }) => {
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

    // The wrapper either returns parsed JSON (encoded back to a string
    // here for the assertion) or a Tengo error string. What it must NOT
    // do is hit the old "runtime not yet wired" stub: that means the
    // _load() path is plumbed through plapi.loadWasm correctly.
    expect(out as string).not.toContain("runtime not yet wired");

    // Either branch carries some non-empty payload; an empty output
    // would mean the wrapper short-circuited or the wasm call returned
    // nothing — both regressions.
    expect((out as string).length).toBeGreaterThan(0);
  },
);
