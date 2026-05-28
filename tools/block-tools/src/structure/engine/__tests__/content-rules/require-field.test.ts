import { describe, test, expect } from "vitest";
import { requireField, withManagedBody, type JsonObject } from "../../content-rules";

function run(input: JsonObject, body: () => void): JsonObject {
  return withManagedBody(input, body);
}

describe("requireField", () => {
  test("no-op when the field is present", () => {
    const out = run({ name: "x" }, () => requireField("name"));
    expect(out).toEqual({ name: "x" });
  });

  test("throws default message when the field is absent", () => {
    expect(() =>
      run({}, () => {
        requireField("name");
      }),
    ).toThrow(/requireField: missing field 'name'/);
  });

  test("throws custom message when supplied", () => {
    expect(() =>
      run({}, () => {
        requireField("name", "block name is required");
      }),
    ).toThrow(/block name is required/);
  });

  test("accepts a nested field via dotted path", () => {
    const out = run({ engines: { node: ">=18" } }, () => requireField("engines.node"));
    expect(out).toEqual({ engines: { node: ">=18" } });
  });

  test("idempotent — running twice on a present field is a no-op", () => {
    const once = run({ name: "x" }, () => requireField("name"));
    const twice = run(JSON.parse(JSON.stringify(once)), () => requireField("name"));
    expect(twice).toEqual(once);
  });
});
