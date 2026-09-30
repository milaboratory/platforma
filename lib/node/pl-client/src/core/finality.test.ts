import { expect, test } from "vitest";
import { FinalityTable } from "./finality";
import type { ResourceData } from "./types";
import { createSignedResourceId, NullSignedResourceId } from "./types";

function resource(typeName: string, resourceReady = true): ResourceData {
  return {
    id: createSignedResourceId(1n),
    originalResourceId: NullSignedResourceId,
    kind: "Structural",
    type: { name: typeName, version: "1" },
    data: undefined,
    error: NullSignedResourceId,
    inputsLocked: resourceReady,
    outputsLocked: resourceReady,
    resourceReady,
    final: false,
    fields: [],
  };
}

const base = FinalityTable.of("base", [
  { match: { name: "A" }, rule: "readyOrDuplicateOrError", why: "test" },
  { match: { name: "B" }, rule: "never", why: "test" },
]);

test("a child layer is its parent plus its additions", () => {
  const child = base.extend("child", [
    { match: { name: "B" }, rule: "always", why: "test" },
    { match: { prefix: "C/" }, rule: "always", why: "test" },
  ]);
  expect(child.isFinal(resource("A"))).toBe(true);
  expect(child.isFinal(resource("A", false))).toBe(false);
  expect(child.isFinal(resource("B"))).toBe(true);
  expect(child.isFinal(resource("C/x"))).toBe(true);
  expect(base.isFinal(resource("B"))).toBe(false);
  expect(base.isFinal(resource("C/x"))).toBe(false);
});

test("an addition cannot make its parent's final resource non-final", () => {
  const child = base.extend("child", [{ match: { name: "A" }, rule: "never", why: "test" }]);
  expect(child.isFinal(resource("A"))).toBe(true);
});

test("a type no layer covers is never final", () => {
  expect(base.extend("child", []).isFinal(resource("Unknown"))).toBe(false);
});

test("a layer lists each match once", () => {
  expect(() =>
    FinalityTable.of("dup", [
      { match: { name: "A" }, rule: "always", why: "test" },
      { match: { name: "A" }, rule: "never", why: "test" },
    ]),
  ).toThrow(/listed twice/);
});

test("entries list the base first", () => {
  const child = base.extend("child", [{ match: { prefix: "C/" }, rule: "always", why: "test" }]);
  expect(child.entries.map((e) => ("name" in e.match ? e.match.name : e.match.prefix))).toEqual([
    "A",
    "B",
    "C/",
  ]);
});
