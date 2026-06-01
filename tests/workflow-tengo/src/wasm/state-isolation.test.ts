import { tplTest } from "@platforma-sdk/test";

// Each assets.importWasm() call must produce an independent Store +
// Instance with isolated heap state. Under the abort-on-err contract,
// a cross-instance miss would kill the render, so we don't probe that
// — instead we observe state isolation through column counts plus a
// same-instance findColumn for each side. A leak (shared Store) would
// surface as equal counts and/or a successful "alpha" lookup against
// the B handle. Distinct counts (5 vs 1) AND each side finding its own
// column rules that out.
tplTest.concurrent(
  "assets.importWasm — sibling instances hold independent state",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability("wasm:v1")) {
      skip();
      return;
    }

    const result = await helper.renderTemplate(
      false,
      "wasm.state-isolation",
      ["countA", "countB", "aFindFromA", "bFindFromB"],
      () => ({}),
    );

    const [countA, countB, aFromA, bFromB] = await Promise.all([
      result.computeOutput("countA", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("countB", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("aFindFromA", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("bFindFromB", (a) => a?.getDataAsJson()).awaitStableValue(),
    ]);

    expect(countA).toBe("5");
    expect(countB).toBe("1");
    expect(aFromA as string).toContain('"alpha"');
    expect(bFromB as string).toContain('"only-in-b"');
  },
);
