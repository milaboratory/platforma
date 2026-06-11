import { describe, test, expect } from "vitest";
import { enforceAlphabeticalOrder, withManagedBody, type JsonObject } from "../../content-rules";

function run(input: JsonObject, body: () => void): JsonObject {
  return withManagedBody(input, body);
}

describe("enforceAlphabeticalOrder", () => {
  test("default form (no args) is a no-op (safety)", () => {
    const out = run({ b: 1, a: 2 }, () => enforceAlphabeticalOrder());
    expect(Object.keys(out)).toEqual(["b", "a"]);
  });

  test("sorts keys at a specific nested path", () => {
    const out = run({ scripts: { test: "x", build: "y", fmt: "z" } }, () =>
      enforceAlphabeticalOrder("scripts"),
    );
    expect(Object.keys(out.scripts as Record<string, unknown>)).toEqual(["build", "fmt", "test"]);
  });

  test("recursive sorts nested objects too", () => {
    const out = run(
      {
        outer: { z: 1, a: { c: 1, b: 2 } },
      },
      () => enforceAlphabeticalOrder("outer", { recursive: true }),
    );
    expect(Object.keys(out.outer as Record<string, unknown>)).toEqual(["a", "z"]);
    const a = (out.outer as { a: Record<string, unknown> }).a;
    expect(Object.keys(a)).toEqual(["b", "c"]);
  });

  test("root recursive sorts entire object", () => {
    const out = run({ b: { z: 1, a: 2 }, a: { y: 1, x: 2 } }, () =>
      enforceAlphabeticalOrder("", { recursive: true }),
    );
    expect(Object.keys(out)).toEqual(["a", "b"]);
    expect(Object.keys(out.a as Record<string, unknown>)).toEqual(["x", "y"]);
    expect(Object.keys(out.b as Record<string, unknown>)).toEqual(["a", "z"]);
  });

  test("no-op when the path is missing or not an object", () => {
    const out = run({ name: "x" }, () => enforceAlphabeticalOrder("scripts"));
    expect(out).toEqual({ name: "x" });
  });

  test("idempotent — second run is deep-equal to the first", () => {
    const once = run({ scripts: { c: 1, a: 2, b: 3 } }, () => enforceAlphabeticalOrder("scripts"));
    const twice = run(JSON.parse(JSON.stringify(once)), () => enforceAlphabeticalOrder("scripts"));
    expect(twice).toEqual(once);
    expect(Object.keys(twice.scripts as Record<string, unknown>)).toEqual(
      Object.keys(once.scripts as Record<string, unknown>),
    );
  });
});
