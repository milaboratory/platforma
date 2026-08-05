import { expect, test } from "vitest";
import { collapse, expand, find } from "./axes.ts";

const axesSpec = [{ type: "Int" as const, name: "a1" }];

test("expand", () => {
  const ids = expand(axesSpec);
  expect(ids).toEqual([{ name: "a1", type: "Int" }]);
});

test("collapse", () => {
  const spec = collapse([{ name: "a1", type: "Int" }]);
  expect(spec).toEqual(axesSpec);
});

test("find - match", () => {
  const index = find(axesSpec, { name: "a1" });
  expect(index).toBe(0);
});

test("find - no match", () => {
  const index = find(axesSpec, { name: "nonexistent" });
  expect(index).toBe(-1);
});
