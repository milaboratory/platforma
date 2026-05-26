import { BackendCapability } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";

// Trap-then-fresh: instance A traps inside the SAME render that later
// builds instance B from a fresh importWasm() call. Reaffirms the Go-side
// invariant (TestRender_LoadWasm_TrapDoesNotPoisonCachedComponent) through
// the full integration path — if the cache record were corrupted by the
// trap, instance B would fail to instantiate or its first method call
// would surface a stale-component error.
tplTest.concurrent(
  "assets.importWasm — guest trap doesn't poison the cached component",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability(BackendCapability.WasmV1)) {
      skip();
      return;
    }

    const result = await helper.renderTemplate(
      false,
      "wasm.trap-then-fresh",
      ["trap", "fresh"],
      () => ({}),
    );

    const trap = await result.computeOutput("trap", (a) => a?.getDataAsJson()).awaitStableValue();
    const fresh = await result.computeOutput("fresh", (a) => a?.getDataAsJson()).awaitStableValue();

    // Trap path surfaces as a Tengo error string (same shape as the
    // existing happy/err/trap test asserts).
    expect(trap as string).toMatch(/wasm trap|unreachable|func_call/);
    // Fresh instance returns the column metadata, proving the cache
    // entry survived the trap intact.
    expect(fresh as string).toContain('"sample_id"');
    expect(fresh as string).toContain('"index"');
  },
);
