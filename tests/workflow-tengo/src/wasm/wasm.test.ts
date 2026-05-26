import { tplTest } from "@platforma-sdk/test";

// End-to-end check of the wasm subsystem: tengo-builder bundles the wasm
// fixture into the template pack, the workflow controller precompiles +
// caches it, and `plapi.loadWasm` dispatches a call into it. Both the
// happy-path branch of `find-column` and the `result.Err` arm are
// exercised in a single render.
tplTest.concurrent(
  "plapi.loadWasm — happy path, result.Err arm, and guest trap",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability("wasm:v1")) {
      skip();
      return;
    }
    const result = await helper.renderTemplate(
      false,
      "wasm.load-and-call",
      ["ok", "err", "trap"],
      () => ({}),
    );

    const ok = await result.computeOutput("ok", (a) => a?.getDataAsJson()).awaitStableValue();
    const err = await result.computeOutput("err", (a) => a?.getDataAsJson()).awaitStableValue();
    const trap = await result.computeOutput("trap", (a) => a?.getDataAsJson()).awaitStableValue();

    // Happy path: the existing column's JSON describes sample_id.
    expect(typeof ok).toBe("string");
    expect(ok as string).toContain("sample_id");

    // result.Err arm gets lifted to a Tengo error value; the script
    // stringifies it. Exact wording comes from the guest, so we just
    // confirm the missing-column path is surfaced as an error string
    // (not the same shape as the ok arm).
    expect(typeof err).toBe("string");
    expect(err as string).not.toEqual(ok as string);

    // Trap path: the fixture's always_panic emits `unreachable`, which the
    // bridge surfaces as a wasmtime trap error. The guest's `msg` arg is
    // not propagated up (wasmtime's trap path doesn't carry a custom
    // payload), so we only assert that the bridge identifies it as a
    // trap and is distinct from the result.Err shape.
    expect(typeof trap).toBe("string");
    expect(trap as string).toMatch(/wasm trap|unreachable|func_call/);
    expect(trap as string).not.toEqual(ok as string);
    expect(trap as string).not.toEqual(err as string);
  },
);

// Each assets.importWasm() returns a fresh sandboxed Store + Instance, so a
// trap that poisons one instance must not affect siblings produced by other
// importWasm calls in the same render.
tplTest.concurrent(
  "assets.importWasm — trap in one sibling instance doesn't poison the others",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability("wasm:v1")) {
      skip();
      return;
    }
    const result = await helper.renderTemplate(
      false,
      "wasm.parallel-instances",
      ["ok1", "trap2", "ok3"],
      () => ({}),
    );

    const ok1 = await result.computeOutput("ok1", (a) => a?.getDataAsJson()).awaitStableValue();
    const trap2 = await result.computeOutput("trap2", (a) => a?.getDataAsJson()).awaitStableValue();
    const ok3 = await result.computeOutput("ok3", (a) => a?.getDataAsJson()).awaitStableValue();

    expect(ok1 as string).toContain("sample_id");
    expect(trap2 as string).toMatch(/wasm trap|unreachable|func_call/);
    // Sibling isolation: instance #3 sees the same result as instance #1
    // despite instance #2 having been poisoned by a trap in between.
    expect(ok3 as string).toEqual(ok1 as string);
  },
);
