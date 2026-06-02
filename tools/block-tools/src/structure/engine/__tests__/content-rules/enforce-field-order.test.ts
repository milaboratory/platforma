import { describe, test, expect } from "vitest";
import {
  enforceFieldOrder,
  enforceFieldOrderAt,
  withManagedBody,
  type JsonObject,
} from "../../content-rules";

function run(input: JsonObject, body: () => void): JsonObject {
  return withManagedBody(input, body);
}

const order = ["name", "version", "private", "scripts", "dependencies", "pnpm"];

describe("enforceFieldOrder / enforceFieldOrderAt", () => {
  test("reorders known keys; unknowns stay adjacent to their preceding known key", () => {
    const out = run(
      {
        name: "x",
        private: true,
        myCustomA: 1,
        scripts: {},
        myCustomB: 2,
        dependencies: {},
      },
      () => enforceFieldOrder(order),
    );
    expect(Object.keys(out)).toEqual([
      "name",
      "private",
      "myCustomA",
      "scripts",
      "myCustomB",
      "dependencies",
    ]);
  });

  test("missing known keys are skipped", () => {
    const out = run({ name: "x", dependencies: {} }, () => enforceFieldOrder(order));
    expect(Object.keys(out)).toEqual(["name", "dependencies"]);
  });

  test("unknowns before any known key go first in source order", () => {
    const out = run({ foo: 1, bar: 2, name: "x" }, () => enforceFieldOrder(order));
    expect(Object.keys(out)).toEqual(["foo", "bar", "name"]);
  });

  test("enforceFieldOrderAt reorders a nested object", () => {
    const out = run(
      {
        scripts: {
          build: "x",
          test: "y",
          fmt: "z",
        },
      },
      () => enforceFieldOrderAt("scripts", ["fmt", "test", "build"]),
    );
    expect(Object.keys(out.scripts as Record<string, unknown>)).toEqual(["fmt", "test", "build"]);
  });

  test("enforceFieldOrderAt is a no-op when path missing", () => {
    const out = run({ name: "x" }, () => enforceFieldOrderAt("scripts", ["a"]));
    expect(out).toEqual({ name: "x" });
  });

  test("idempotent — second run produces deep-equal output", () => {
    const once = run({ name: "x", scripts: {}, type: "module" }, () => enforceFieldOrder(order));
    const twice = run(JSON.parse(JSON.stringify(once)), () => enforceFieldOrder(order));
    expect(twice).toEqual(once);
    expect(Object.keys(twice)).toEqual(Object.keys(once));
  });
});
