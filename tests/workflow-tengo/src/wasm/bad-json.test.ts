import { tplTest } from "@platforma-sdk/test";

// Malformed-input probe. The fixture's guest serde_json must reject
// garbage cleanly so the result.Err arm lifts to a Tengo error, NOT a
// wasm trap. We assert two properties per case:
//   1) The bad call surfaces an error string (not a successful table
//      handle and not a wasm-trap string).
//   2) The instance is NOT poisoned: a valid fromJson() on the same
//      handle returns a usable table again.
tplTest.concurrent(
  "assets.importWasm — bad JSON input surfaces clean errors, doesn't poison instance",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability("wasm:v1")) {
      skip();
      return;
    }

    const result = await helper.renderTemplate(
      false,
      "wasm.bad-json",
      [
        "badEmpty",
        "recoverEmpty",
        "badTrunc",
        "recoverTrunc",
        "badGarbage",
        "recoverGarbage",
        "badSchema",
        "recoverSchema",
      ],
      () => ({}),
    );

    const [
      badEmpty,
      recoverEmpty,
      badTrunc,
      recoverTrunc,
      badGarbage,
      recoverGarbage,
      badSchema,
      recoverSchema,
    ] = await Promise.all([
      result.computeOutput("badEmpty", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("recoverEmpty", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("badTrunc", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("recoverTrunc", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("badGarbage", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("recoverGarbage", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("badSchema", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("recoverSchema", (a) => a?.getDataAsJson()).awaitStableValue(),
    ]);

    // Bad calls must surface an error indicator (the Err arm gets lifted
    // to a Tengo error, which string()ifies into something containing
    // "error" or the parse-error wording from serde_json). Crucially,
    // they MUST NOT carry the wasm-trap signature.
    const trapPattern = /wasm trap|unreachable|func_call/;
    for (const bad of [badEmpty, badTrunc, badGarbage, badSchema] as string[]) {
      expect(bad).not.toMatch(trapPattern);
      expect(bad).toMatch(/error|expected|missing|EOF|invalid|fromJson|column/i);
    }

    // Recovery calls returned a usable resource — the resource's
    // stringification has its own characteristic shape (the Tengo
    // wrapper's _Resource_, or no error markers). We assert at minimum
    // they don't look like errors and don't match the trap pattern.
    for (const recovered of [
      recoverEmpty,
      recoverTrunc,
      recoverGarbage,
      recoverSchema,
    ] as string[]) {
      expect(recovered).not.toMatch(trapPattern);
      expect(recovered).not.toMatch(/^error/i);
    }
  },
);
