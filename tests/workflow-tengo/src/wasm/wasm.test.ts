import { tplTest } from "@platforma-sdk/test";

// Simple end-to-end check of the wasm subsystem's
tplTest.concurrent(
  "plapi.loadWasm — happy path round-trip",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability("wasm:v1")) {
      skip();
      return;
    }
    const result = await helper.renderTemplate(false, "wasm.wasm", ["ok"], () => ({}));

    const ok = await result.computeOutput("ok", (a) => a?.getDataAsJson()).awaitStableValue();
    expect(typeof ok).toBe("string");
    expect(ok as string).toContain("sample_id");
  },
);

// result<X, string>::Err arms abort the script. The fixture's
// `find-column` returns Err for a missing column; the render fails with
// the err string surfaced as the template-eval error. The output
// computable rejects on stable-value resolution.
tplTest.concurrent(
  "plapi.loadWasm — result.Err arm aborts the render",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability("wasm:v1")) {
      skip();
      return;
    }
    const result = await helper.renderTemplate(false, "wasm.wasm-err", ["unreachable"], () => ({}));
    await expect(
      result.computeOutput("unreachable", (a) => a?.getDataAsJson()).awaitStableValue(),
    ).rejects.toThrow(/no_such_col|find-column|missing/);
  },
);

// Guest traps abort the script. The bridge surfaces wasmtime's "wasm
// trap: ... unreachable instruction executed" as a render-level error;
// the output computable rejects.
tplTest.concurrent(
  "plapi.loadWasm — guest trap aborts the render",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability("wasm:v1")) {
      skip();
      return;
    }
    const result = await helper.renderTemplate(
      false,
      "wasm.wasm-trap",
      ["unreachable"],
      () => ({}),
    );
    await expect(
      result.computeOutput("unreachable", (a) => a?.getDataAsJson()).awaitStableValue(),
    ).rejects.toThrow(/wasm trap|unreachable|always-panic/);
  },
);
