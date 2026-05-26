import { BackendCapability } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";
import { vi } from "vitest";

// Two-part epoch-deadline probe.
//
// 1) "short call completes": baseline that proves the spinMillis fixture
//    method round-trips through the bridge when the call is well under
//    the per-call deadline. Fast, runs in every PL_TEST_RUN_SLOW build.
//
// 2) "long call rejected": invokes a guaranteed-runaway guest and asserts
//    the render fails with SOME deadline / timeout / trap indicator. The
//    backend has two overlapping caps that fire at ~1 minute — the wasm
//    per-call epoch deadline (defaultWasmCallTimeout) and the interpreter's
//    MaxExecutionTime — and either can win the race. We accept both
//    wordings; the bar is just "the system rejected the runaway call
//    rather than blocking forever." Gated behind PL_TEST_RUN_SLOW=1
//    because it always burns ~60s of wall clock.

const RUN_SLOW = process.env.PL_TEST_RUN_SLOW === "1";

vi.setConfig({ testTimeout: 180_000 });

tplTest.concurrent(
  "assets.importWasm — short spinMillis call completes",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability(BackendCapability.WasmV1)) {
      skip();
      return;
    }
    const result = await helper.renderTemplate(false, "wasm.epoch-deadline", ["short"], () => ({}));
    const short = await result.computeOutput("short", (a) => a?.getDataAsJson()).awaitStableValue();
    expect(short as string).toMatch(/spun/);
  },
);

(RUN_SLOW ? tplTest.concurrent : tplTest.concurrent.skip)(
  "assets.importWasm — runaway guest is rejected by deadline",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability(BackendCapability.WasmV1)) {
      skip();
      return;
    }
    const result = await helper.renderTemplate(
      false,
      "wasm.epoch-deadline-runaway",
      ["long"],
      () => ({}),
    );
    // The output computation must reject. We accept either a wasm trap
    // surfaced as a Tengo error string or the interpreter's deadline
    // tripping with `context deadline exceeded`. Both prove the runaway
    // call was rejected.
    await expect(
      result.computeOutput("long", (a) => a?.getDataAsJson()).awaitStableValue(),
    ).rejects.toThrow(/deadline|timeout|trap|wasm|interrupt|unreachable|exceeded/i);
  },
);
