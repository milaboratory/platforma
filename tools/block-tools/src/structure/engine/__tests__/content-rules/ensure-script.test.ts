import { describe, test, expect } from "vitest";
import { ensureScript, removeScript, withManagedBody, type JsonObject } from "../../content-rules";

function run(input: JsonObject, body: () => void): JsonObject {
  return withManagedBody(input, body);
}

describe("ensureScript / removeScript", () => {
  test("ensureScript creates scripts.<name> on an empty object", () => {
    const out = run({}, () => ensureScript("test", "vitest"));
    expect(out).toEqual({ scripts: { test: "vitest" } });
  });

  test("ensureScript adds to an existing scripts map", () => {
    const out = run({ scripts: { test: "vitest" } }, () => ensureScript("build", "tsc"));
    expect(out).toEqual({ scripts: { test: "vitest", build: "tsc" } });
  });

  test("ensureScript replaces an existing script value", () => {
    const out = run({ scripts: { build: "old" } }, () => ensureScript("build", "new"));
    expect(out).toEqual({ scripts: { build: "new" } });
  });

  test("removeScript removes an existing script", () => {
    const out = run({ scripts: { build: "x", test: "y" } }, () => removeScript("build"));
    expect(out).toEqual({ scripts: { test: "y" } });
  });

  test("removeScript is a no-op when the script is absent", () => {
    const out = run({ scripts: { test: "y" } }, () => removeScript("missing"));
    expect(out).toEqual({ scripts: { test: "y" } });
  });

  test("idempotent — running ensureScript twice is a no-op", () => {
    const once = run({}, () => ensureScript("build", "tsc"));
    const twice = run(JSON.parse(JSON.stringify(once)), () => ensureScript("build", "tsc"));
    expect(twice).toEqual(once);
  });
});
