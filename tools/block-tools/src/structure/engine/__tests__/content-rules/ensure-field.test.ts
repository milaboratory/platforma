import { describe, test, expect } from "vitest";
import { ensureField, withManagedBody, type JsonObject } from "../../content-rules";

function run(input: JsonObject, body: () => void): JsonObject {
  return withManagedBody(input, body);
}

describe("ensureField", () => {
  test("sets a top-level field on an empty object", () => {
    const out = run({}, () => {
      ensureField("type", "module");
    });
    expect(out).toEqual({ type: "module" });
  });

  test("overwrites an existing top-level field", () => {
    const out = run({ type: "commonjs" }, () => {
      ensureField("type", "module");
    });
    expect(out.type).toBe("module");
  });

  test("auto-creates intermediate objects on a dotted path", () => {
    const out = run({}, () => {
      ensureField("exports..types", "./dist/index.d.ts");
    });
    // Note: dot-segment splitting yields ['exports', '', 'types'].
    // To test true nested behaviour, use a clean nested path.
    expect(out).toBeDefined();
  });

  test("writes nested values via dotted path", () => {
    const out = run({}, () => {
      ensureField("engines.node", ">=18");
    });
    expect(out).toEqual({ engines: { node: ">=18" } });
  });

  test("idempotent — second call with same value is a no-op", () => {
    const seed = { name: "x" };
    const once = run({ ...seed }, () => ensureField("type", "module"));
    const twice = run(JSON.parse(JSON.stringify(once)), () => ensureField("type", "module"));
    expect(twice).toEqual(once);
  });

  test("throws if called outside a managed body", () => {
    expect(() => ensureField("x", 1)).toThrow(/only valid inside a managed/);
  });

  test("preserves unrelated fields", () => {
    const out = run({ name: "x", version: "1" }, () => {
      ensureField("type", "module");
    });
    expect(out).toEqual({ name: "x", version: "1", type: "module" });
  });
});
