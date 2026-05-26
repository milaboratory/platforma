import { tplTest } from "@platforma-sdk/test";

// End-to-end check of the wasm subsystem: tengo-builder bundles the wasm
// fixture into the template pack, the workflow controller precompiles +
// caches it, and `plapi.loadWasm` dispatches a call into it. Both the
// happy-path branch of `find-column` and the `result.Err` arm are
// exercised in a single render.
tplTest.concurrent(
  "plapi.loadWasm — happy path, result.Err arm, and guest trap",
  async ({ helper, expect }) => {
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
    console.log("#####" + ok);

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
