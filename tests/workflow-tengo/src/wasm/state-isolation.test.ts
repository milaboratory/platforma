import { tplTest } from "@platforma-sdk/test";

// Each assets.importWasm() call must produce an independent Store +
// Instance with isolated heap state. We don't trust trap-only checks
// (one instance trapping while siblings still work) to catch a state
// leak — if a buggy host accidentally shared the same Store between
// two handles, both would observe each other's columns without any
// trap firing. So we cross-probe: instance A's column lookup against B
// and vice versa, plus column counts. A leak would show up as A's name
// being findable in B (or B's count being non-zero with A's columns).
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
      ["countA", "countB", "aFindFromA", "aFindFromB", "bFindFromA", "bFindFromB"],
      () => ({}),
    );

    const [countA, countB, aFromA, aFromB, bFromA, bFromB] = await Promise.all([
      result.computeOutput("countA", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("countB", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("aFindFromA", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("aFindFromB", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("bFindFromA", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("bFindFromB", (a) => a?.getDataAsJson()).awaitStableValue(),
    ]);

    // Each instance reports its own column count (string-wrapped by the
    // template so the output resource has uniform JSON-string shape).
    expect(countA).toBe("5");
    expect(countB).toBe("1");

    // Same-instance lookups succeed and return the column's JSON.
    expect(aFromA as string).toContain('"alpha"');
    expect(bFromB as string).toContain('"only-in-b"');

    // Cross-instance lookups must miss. The fixture returns
    // result.Err("column '...' not found") which the wrapper lifts to a
    // Tengo error; the test template stringifies it. We accept either a
    // miss phrasing or any error indicator — the key is that the lookup
    // doesn't return the column's JSON shape.
    expect(aFromB as string).not.toContain('"index"');
    expect(bFromA as string).not.toContain('"index"');
    expect(aFromB as string).toMatch(/not found|error|err/i);
    expect(bFromA as string).toMatch(/not found|error|err/i);
  },
);
