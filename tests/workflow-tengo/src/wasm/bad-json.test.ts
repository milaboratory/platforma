import { Pl, stringifyJson } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";

// Malformed-input probe. Each bad input must reach the guest's
// serde_json parser and come back as the result<X, string>::Err arm,
// which the bridge surfaces as a script abort. The output computable
// rejects with the guest-side parse error in its message. The
// trap-vs-Err distinction (serde parse error vs wasmtime trap) is
// asserted in the Go-side wasm unit tests where the error message is
// directly inspectable.

async function runBadInput(helper: any, expect: any, badInput: string): Promise<void> {
  const result = await helper.renderTemplate(true, "wasm.bad-json", ["unreachable"], (tx: any) => ({
    badInput: tx.createValue(Pl.JsonObject, stringifyJson(badInput)),
  }));
  await expect(
    result.computeOutput("unreachable", (a: any) => a?.getDataAsJson()).awaitStableValue(),
  ).rejects.toThrow(/from-json|expected value|missing field|EOF/);
}

tplTest.concurrent(
  "assets.importWasm — empty string input aborts the render",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability("wasm:v1")) {
      skip();
      return;
    }
    await runBadInput(helper, expect, "");
  },
);

tplTest.concurrent(
  "assets.importWasm — truncated JSON input aborts the render",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability("wasm:v1")) {
      skip();
      return;
    }
    await runBadInput(helper, expect, '{"columns": [');
  },
);

tplTest.concurrent(
  "assets.importWasm — non-JSON garbage input aborts the render",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability("wasm:v1")) {
      skip();
      return;
    }
    await runBadInput(helper, expect, "hello, not json");
  },
);

tplTest.concurrent(
  "assets.importWasm — schema-mismatched JSON input aborts the render",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability("wasm:v1")) {
      skip();
      return;
    }
    await runBadInput(helper, expect, '{"not_columns": 42}');
  },
);
