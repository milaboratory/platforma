// JSON parser primitives — round trip, jsonPath set/get/has/delete,
// top-level key reorder behaviour.

import { describe, test, expect } from "vitest";
import {
  parseJson,
  stringifyJson,
  getAtPath,
  hasAtPath,
  setAtPath,
  deleteAtPath,
  reorderTopLevel,
} from "../parsers/json";
import type { JsonObject } from "../parsers/json";

describe("JSON parser — round trip + jsonPath helpers", () => {
  test("parse + stringify is stable on canonical input", () => {
    const raw = '{\n  "a": 1,\n  "b": {\n    "c": 2\n  }\n}\n';
    const parsed = parseJson(raw);
    expect(stringifyJson(parsed)).toBe(raw);
  });

  test("stringify preserves source key order even when not alphabetical", () => {
    // V8 / spec: JSON.parse + JSON.stringify preserve insertion order for
    // string keys. The structurer's "no implicit ordering" guarantee
    // depends on this — verify it here so a future runtime change is
    // caught.
    const raw = '{\n  "z": 1,\n  "a": 2,\n  "m": 3\n}\n';
    const parsed = parseJson(raw);
    expect(Object.keys(parsed as object)).toEqual(["z", "a", "m"]);
    expect(stringifyJson(parsed)).toBe(raw);
  });

  test("getAtPath / hasAtPath", () => {
    const obj: JsonObject = { a: { b: { c: 42 } } };
    expect(getAtPath(obj, "a.b.c")).toBe(42);
    expect(getAtPath(obj, "a.b")).toEqual({ c: 42 });
    expect(getAtPath(obj, "missing")).toBeUndefined();
    expect(hasAtPath(obj, "a.b.c")).toBe(true);
    expect(hasAtPath(obj, "a.b.z")).toBe(false);
  });

  test("setAtPath auto-creates intermediate objects", () => {
    const obj: JsonObject = {};
    setAtPath(obj, "a.b.c", "x");
    expect(obj).toEqual({ a: { b: { c: "x" } } });
    setAtPath(obj, "a.b.c", "y");
    expect(obj).toEqual({ a: { b: { c: "y" } } });
  });

  test("setAtPath refuses to overwrite a non-object on the way down", () => {
    const obj: JsonObject = { a: 1 };
    expect(() => setAtPath(obj, "a.b", 2)).toThrow(/non-object/);
  });

  test("deleteAtPath removes the leaf, no-op on missing", () => {
    const obj: JsonObject = { a: { b: 1, c: 2 } };
    deleteAtPath(obj, "a.b");
    expect(obj).toEqual({ a: { c: 2 } });
    deleteAtPath(obj, "a.b");
    expect(obj).toEqual({ a: { c: 2 } });
    deleteAtPath(obj, "missing.path");
    expect(obj).toEqual({ a: { c: 2 } });
  });
});

describe("reorderTopLevel — known keys ordered, unknowns ride preceding known", () => {
  const ORDER = ["name", "version", "private", "scripts", "dependencies", "pnpm"];

  test("worked example preserves grouping", () => {
    const input: JsonObject = {
      name: "x",
      private: true,
      myCustomA: 1,
      scripts: {},
      myCustomB: 2,
      dependencies: {},
    };
    const out = reorderTopLevel(input, ORDER);
    expect(Object.keys(out)).toEqual([
      "name",
      "private",
      "myCustomA",
      "scripts",
      "myCustomB",
      "dependencies",
    ]);
  });

  test("known keys move into declared order", () => {
    const input: JsonObject = {
      scripts: {},
      private: true,
      name: "x",
    };
    const out = reorderTopLevel(input, ORDER);
    expect(Object.keys(out)).toEqual(["name", "private", "scripts"]);
  });

  test("unknown leading keys go first, in source order", () => {
    const input: JsonObject = {
      leading: 1,
      another: 2,
      name: "x",
    };
    const out = reorderTopLevel(input, ORDER);
    expect(Object.keys(out)).toEqual(["leading", "another", "name"]);
  });

  test("idempotent — second reorder is a no-op", () => {
    const input: JsonObject = {
      name: "x",
      private: true,
      myCustom: 1,
      scripts: {},
    };
    const once = reorderTopLevel(input, ORDER);
    const twice = reorderTopLevel(once, ORDER);
    expect(twice).toEqual(once);
  });

  test("reorder survives stringify → parse → stringify round-trip", () => {
    // The structurer writes a managed file via stringifyJson(parsed)
    // after reordering. A subsequent run parses that file again and
    // must observe the same key order — otherwise the engine would
    // report a diff and the post-run recheck would fail. Lock the
    // contract here.
    const input: JsonObject = {
      scripts: { build: "x" },
      private: true,
      myCustomA: 1,
      name: "demo",
      myCustomB: 2,
      dependencies: { foo: "1.0.0" },
    };
    const reordered = reorderTopLevel(input, ORDER);
    const serialised = stringifyJson(reordered);
    const reparsed = parseJson(serialised) as JsonObject;
    // Source: scripts, private, myCustomA, name, myCustomB, dependencies.
    //   myCustomA followed `private` → rides private.
    //   myCustomB followed `name`    → rides name.
    expect(Object.keys(reparsed)).toEqual([
      "name",
      "myCustomB",
      "private",
      "myCustomA",
      "scripts",
      "dependencies",
    ]);
    // Second reorder + serialise must be byte-identical to the first.
    expect(stringifyJson(reorderTopLevel(reparsed, ORDER))).toBe(serialised);
  });
});
