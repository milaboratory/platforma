import { tplTest } from "@platforma-sdk/test";

// Verifies the backend's MaxWasmStoresPerRender = 64 limit surfaces
// end-to-end through Tengo: 64 successful imports + 1 over the cap
// aborts the render with a clear cap-mentioning error. Mirrors the
// Go-side probe at controllers/workflow/pkg/lang/api_v1_loadwasm_test.go
// but drives it through the full template-render path so we catch any
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
      ["unreachable"],
      () => ({}),
    );
    await expect(
      result.computeOutput("unreachable", (a) => a?.getDataAsJson()).awaitStableValue(),
    ).rejects.toThrow(/per-render cap/);
  },
);
