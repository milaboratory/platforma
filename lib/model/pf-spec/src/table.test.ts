import type { PColumnSpec, PObjectId, PTableColumnSpec } from "@milaboratories/pl-model-common";
import { expect, test } from "vitest";
import { findColumn } from "./table.ts";

const column1Spec: PColumnSpec = {
  kind: "PColumn",
  name: "column1",
  valueType: "Int",
  axesSpec: [{ type: "Int", name: "a1" }],
};

const tableSpec: PTableColumnSpec[] = [
  {
    type: "axis",
    id: { name: "a1", type: "Int" },
    spec: { name: "a1", type: "Int" },
  },
  {
    type: "column",
    id: "column1" as PObjectId,
    spec: column1Spec,
  },
];

test("findColumn - axis", () => {
  expect(findColumn(tableSpec, { type: "axis", id: { name: "a1", type: "Int" } })).toBe(0);
});

test("findColumn - column", () => {
  expect(findColumn(tableSpec, { type: "column", id: "column1" as PObjectId })).toBe(1);
});

test("findColumn - not found", () => {
  expect(findColumn(tableSpec, { type: "column", id: "nonexistent" as PObjectId })).toBe(-1);
});
