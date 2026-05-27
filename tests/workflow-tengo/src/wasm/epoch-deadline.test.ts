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
    if (!pl.hasCapability("wasm:v1")) {
      skip();
      return;
    }

    const result = await helper.renderTemplate(
      false,
      "wasm.epoch-deadline",
      ["short", "duration"],
      () => ({}),
    );
    const short = await result.computeOutput("short", (a) => a?.getDataAsJson()).awaitStableValue();
    expect(short as string).toMatch(/spun/);

    const duration = await result
      .computeOutput("duration", (a) => a?.getDataAsJson())
      .awaitStableValue();
    // kept the log intentionally, vitest counts wrong test time,
    // shows same for both short and deadline rejected
    console.info("duration of short test =", duration, "ms");
  },
);

(RUN_SLOW ? tplTest.concurrent : tplTest.concurrent.skip)(
  "assets.importWasm — runaway guest is rejected by deadline",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability("wasm:v1")) {
      skip();
      return;
    }
    // Either layer can win the race — wasm per-call epoch deadline
    // (defaultWasmCallTimeout) or the interpreter's MaxExecutionTime.
    // Either way the script aborts and the output computable rejects.
    const result = await helper.renderTemplate(
      false,
      "wasm.epoch-deadline-runaway",
      ["unreachable"],
      () => ({}),
    );
    await expect(
      result.computeOutput("unreachable", (a) => a?.getDataAsJson()).awaitStableValue(),
    ).rejects.toThrow(/wasm trap|deadline|timeout|exceeded|interrupt/i);
  },
);
