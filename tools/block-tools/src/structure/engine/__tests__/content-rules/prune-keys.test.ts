import { describe, test, expect } from "vitest";
import {
  pruneKeysMatching,
  pruneKeysMatchingAt,
  withManagedBody,
  type JsonObject,
} from "../../content-rules";

function run(input: JsonObject, body: () => void): JsonObject {
  return withManagedBody(input, body);
}

describe("pruneKeysMatching / pruneKeysMatchingAt", () => {
  test("removes top-level keys matching the predicate", () => {
    const out = run({ name: "x", "//pnpm": { overrides: {} }, "///": {} }, () =>
      pruneKeysMatching((k) => k.startsWith("//") || k.startsWith("///")),
    );
    expect(out).toEqual({ name: "x" });
  });

  test("predicate sees key and value — combined match", () => {
    const out = run({ "//pnpm": { pnpm: { overrides: { foo: "1" } } }, "// kept": "comment" }, () =>
      pruneKeysMatching((k, v) => {
        if (!k.startsWith("//")) return false;
        if (typeof v !== "object" || v === null) return false;
        const o = v as Record<string, unknown>;
        return o.pnpm !== undefined || o.overrides !== undefined;
      }),
    );
    expect(out).toEqual({ "// kept": "comment" });
  });

  test("no-op when nothing matches", () => {
    const out = run({ name: "x", type: "module" }, () =>
      pruneKeysMatching((k) => k.startsWith("//")),
    );
    expect(out).toEqual({ name: "x", type: "module" });
  });

  test("pruneKeysMatchingAt operates on a nested object", () => {
    const out = run({ scripts: { build: "x", _dev_helper: "y", test: "z" } }, () =>
      pruneKeysMatchingAt("scripts", (k) => k.startsWith("_")),
    );
    expect(out).toEqual({ scripts: { build: "x", test: "z" } });
  });

  test("pruneKeysMatchingAt is a no-op when the path is missing", () => {
    const out = run({ name: "x" }, () => pruneKeysMatchingAt("scripts", () => true));
    expect(out).toEqual({ name: "x" });
  });

  test("idempotent — second run is a no-op", () => {
    const once = run({ a: 1, "//x": 2 }, () => pruneKeysMatching((k) => k.startsWith("//")));
    const twice = run(JSON.parse(JSON.stringify(once)), () =>
      pruneKeysMatching((k) => k.startsWith("//")),
    );
    expect(twice).toEqual(once);
  });
});
