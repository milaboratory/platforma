import { describe, test, expect } from "vitest";
import { ensureFieldEntries, withManagedBody, type JsonObject } from "../../content-rules";

function run(input: JsonObject, body: () => void): JsonObject {
  return withManagedBody(input, body);
}

describe("ensureFieldEntries", () => {
  test("creates the target object when absent", () => {
    const out = run({}, () => ensureFieldEntries("engines", { node: ">=18", npm: ">=9" }));
    expect(out).toEqual({ engines: { node: ">=18", npm: ">=9" } });
  });

  test("merges entries into an existing object, preserving unrelated keys", () => {
    const out = run({ engines: { node: "18" } }, () =>
      ensureFieldEntries("engines", { npm: ">=9" }),
    );
    expect(out).toEqual({ engines: { node: "18", npm: ">=9" } });
  });

  test("overwrites existing entries with new values", () => {
    const out = run({ engines: { node: "16" } }, () =>
      ensureFieldEntries("engines", { node: ">=18" }),
    );
    expect(out).toEqual({ engines: { node: ">=18" } });
  });

  test("idempotent — second run produces the same object", () => {
    const once = run({}, () => ensureFieldEntries("scripts", { test: "vitest", build: "x" }));
    const twice = run(JSON.parse(JSON.stringify(once)), () =>
      ensureFieldEntries("scripts", { test: "vitest", build: "x" }),
    );
    expect(twice).toEqual(once);
  });
});
