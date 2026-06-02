import { describe, test, expect } from "vitest";
import { transformAt, withManagedBody, type JsonObject } from "../../content-rules";

function run(input: JsonObject, body: () => void): JsonObject {
  return withManagedBody(input, body);
}

describe("transformAt", () => {
  test("replaces a primitive at the given path", () => {
    const out = run({ count: 1 }, () => transformAt<number>("count", (v) => (v ?? 0) + 1));
    expect(out).toEqual({ count: 2 });
  });

  test("replaces a nested object at the given path", () => {
    const out = run({ block: { foo: 1 } }, () =>
      transformAt<{ foo: number }>("block", (v) => ({ ...v, bar: 2 }) as { foo: number }),
    );
    expect(out).toEqual({ block: { foo: 1, bar: 2 } });
  });

  test("auto-creates intermediate objects for missing nested paths", () => {
    const out = run({}, () => transformAt<string | undefined>("nested.key", () => "ok"));
    expect(out).toEqual({ nested: { key: "ok" } });
  });

  test("idempotent — when the lambda is a fixed point, second run is a no-op", () => {
    const fix = (v: number | undefined) => ((v ?? 0) > 5 ? v! : 5);
    const once = run({ count: 1 }, () => transformAt<number>("count", fix));
    const twice = run(JSON.parse(JSON.stringify(once)), () => transformAt<number>("count", fix));
    expect(once).toEqual({ count: 5 });
    expect(twice).toEqual(once);
  });
});
