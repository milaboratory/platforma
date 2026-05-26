import { tplTest } from "@platforma-sdk/test";
import { vi } from "vitest";

// 63 sibling instances inside one render. Just below the per-render
// Store budget (MaxWasmStoresPerRender = 64). Each instance does a
// small alloc + findColumn so the test stresses concurrent Store
// instantiation + memory accounting under realistic usage, not a
// best-case path. We assert: all 63 succeeded; the sampled lookup
// results contain the expected column metadata; no errors leaked.
vi.setConfig({ testTimeout: 60_000 });

tplTest.concurrent(
  "assets.importWasm — 63 sibling instances in one render all succeed",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability("wasm:v1")) {
      skip();
      return;
    }

    const result = await helper.renderTemplate(
      false,
      "wasm.near-budget",
      ["okCount", "lookupSamples", "lastErr"],
      () => ({}),
    );

    const [okCount, samplesJson, lastErr] = await Promise.all([
      result.computeOutput("okCount", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("lookupSamples", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("lastErr", (a) => a?.getDataAsJson()).awaitStableValue(),
    ]);

    expect(okCount).toBe("63");
    expect(lastErr).toBe("");

    const samples = JSON.parse(samplesJson as string) as string[];
    expect(samples).toHaveLength(3);
    for (const s of samples) {
      expect(s).toContain('"sample_id"');
      expect(s).toContain('"index"');
    }
  },
);
