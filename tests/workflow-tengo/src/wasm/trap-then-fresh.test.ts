import { tplTest } from "@platforma-sdk/test";

// A guest trap in one render must not break the engine for a follow-up
// render that re-imports the same wasm package. Two-step:
//   1. Render wasm.load-and-call-trap: expected to abort (always_panic).
//   2. Render wasm.trap-then-fresh: re-imports the same fixture and runs
//      findColumn — must succeed.
// If the engine / pinned-Component machinery were corrupted by the trap,
// step 2 would fail at instantiation or its first method call.
tplTest.concurrent(
  "assets.importWasm — guest trap in one render doesn't break the next",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability("wasm:v1")) {
      skip();
      return;
    }

    // Step 1: trap-render aborts → output computable rejects.
    const trapped = await helper.renderTemplate(
      false,
      "wasm.load-and-call-trap",
      ["unreachable"],
      () => ({}),
    );
    await expect(
      trapped.computeOutput("unreachable", (a) => a?.getDataAsJson()).awaitStableValue(),
    ).rejects.toThrow(/wasm trap|unreachable|always-panic/);

    // Step 2: fresh-import render against the same fixture must succeed.
    const ok = await helper.renderTemplate(false, "wasm.trap-then-fresh", ["fresh"], () => ({}));
    const fresh = await ok.computeOutput("fresh", (a) => a?.getDataAsJson()).awaitStableValue();
    expect(fresh as string).toContain('"sample_id"');
    expect(fresh as string).toContain('"index"');
  },
);
