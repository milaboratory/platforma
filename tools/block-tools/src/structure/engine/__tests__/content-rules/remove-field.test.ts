import { describe, test, expect } from "vitest";
import { removeField, withManagedBody, type JsonObject } from "../../content-rules";

function run(input: JsonObject, body: () => void): JsonObject {
  return withManagedBody(input, body);
}

describe("removeField", () => {
  test("removes an existing top-level field unconditionally", () => {
    const out = run({ name: "x", legacy: 1 }, () => removeField("legacy"));
    expect(out).toEqual({ name: "x" });
  });

  test("no-op when the field is absent", () => {
    const out = run({ name: "x" }, () => removeField("legacy"));
    expect(out).toEqual({ name: "x" });
  });

  test("removes a nested field via dotted path", () => {
    const out = run({ pnpm: { overrides: { foo: "1" } } }, () => removeField("pnpm.overrides"));
    expect(out).toEqual({ pnpm: {} });
  });

  test("predicate=false leaves the field intact", () => {
    const out = run({ pnpm: { overrides: { foo: "1" } } }, () =>
      removeField(
        "pnpm.overrides",
        (v) => typeof v === "object" && v !== null && Object.keys(v).length === 0,
      ),
    );
    expect(out).toEqual({ pnpm: { overrides: { foo: "1" } } });
  });

  test("predicate=true removes the field", () => {
    const out = run({ pnpm: { overrides: {} } }, () =>
      removeField(
        "pnpm.overrides",
        (v) => typeof v === "object" && v !== null && Object.keys(v).length === 0,
      ),
    );
    expect(out).toEqual({ pnpm: {} });
  });

  test("idempotent — second run is a no-op", () => {
    const once = run({ a: 1, b: 2 }, () => removeField("b"));
    const twice = run(JSON.parse(JSON.stringify(once)), () => removeField("b"));
    expect(twice).toEqual(once);
  });
});
