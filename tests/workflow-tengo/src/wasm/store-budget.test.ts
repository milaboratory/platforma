import { tplTest } from "@platforma-sdk/test";

// Verifies the backend's MaxWasmStoresPerRender = 64 limit surfaces
// end-to-end through Tengo: instances 0..63 succeed, instance 64 fails
// with a Tengo error. Mirrors the Go-side probe at
// core/pl/controllers/workflow/pkg/lang/api_v1_loadwasm_test.go but
// drives it through the full template-render path so we catch any
// breakage in the bundling, loading, or error-surfacing layers.
tplTest.concurrent(
  "assets.importWasm — per-render Store budget caps at 64",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability("wasm:v1")) {
      skip();
      return;
    }

    const result = await helper.renderTemplate(
      false,
      "wasm.store-budget",
      ["firstErrAt", "totalErrs", "lastErrMsg"],
      () => ({}),
    );

    const firstErrAt = await result
      .computeOutput("firstErrAt", (a) => a?.getDataAsJson())
      .awaitStableValue();
    const totalErrs = await result
      .computeOutput("totalErrs", (a) => a?.getDataAsJson())
      .awaitStableValue();
    const lastErrMsg = await result
      .computeOutput("lastErrMsg", (a) => a?.getDataAsJson())
      .awaitStableValue();

    expect(firstErrAt).toBe(64);
    expect(totalErrs).toBe(1);
    // The error from the host should mention the cap so operators can
    // diagnose it. We don't pin the exact wording — just that it
    // references the limit or a "max" / "budget" / "cap" / "limit" hint.
    expect(lastErrMsg as string).toMatch(/wasm|store|budget|cap|limit|max/i);
  },
);
