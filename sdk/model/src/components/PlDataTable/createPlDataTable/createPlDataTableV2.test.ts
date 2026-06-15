import {
  Annotation,
  type PColumnSpec,
  type PObjectId,
  type PTableColumnId,
} from "@milaboratories/pl-model-common";
import { describe, expect, test } from "vitest";
import { computeHiddenColumnsV2 } from "./createPlDataTableV2";

function col(id: string, visibility?: "optional" | "hidden"): { id: PObjectId; spec: PColumnSpec } {
  return {
    id: id as PObjectId,
    spec: {
      kind: "PColumn",
      name: id,
      valueType: "Int",
      axesSpec: [],
      annotations: visibility ? { [Annotation.Table.Visibility]: visibility } : {},
    } as PColumnSpec,
  };
}

const colRef = (id: string): PTableColumnId =>
  ({ type: "column", id: id as PObjectId }) as PTableColumnId;

const hiddenIds = (s: Set<PObjectId>): string[] => [...s].sort();

describe("computeHiddenColumnsV2 (deviation-aware)", () => {
  test("with no overrides, hides optional columns and shows the rest", () => {
    const cols = [col("visible"), col("opt", "optional")];
    expect(hiddenIds(computeHiddenColumnsV2(cols, null, null))).toEqual(["opt"]);
  });

  test("a user-hidden column (block default visible) becomes hidden", () => {
    const cols = [col("a"), col("b")];
    expect(hiddenIds(computeHiddenColumnsV2(cols, [colRef("a")], null))).toEqual(["a"]);
  });

  test("a user-shown column (block default optional) becomes visible", () => {
    const cols = [col("a", "optional"), col("b", "optional")];
    expect(hiddenIds(computeHiddenColumnsV2(cols, null, [colRef("a")]))).toEqual(["b"]);
  });

  // Regression for the old absolute-set reader: a non-null hide list was treated as
  // "hide exactly these", so an empty list (user only showed a column) unhid EVERY
  // optional column. Deviations must keep untouched optional columns hidden.
  test("empty hiddenColIds with a show-override keeps other optional columns hidden", () => {
    const cols = [col("opt1", "optional"), col("opt2", "optional")];
    expect(hiddenIds(computeHiddenColumnsV2(cols, [], [colRef("opt1")]))).toEqual(["opt2"]);
  });

  // MILAB-6002: an untouched column follows its CURRENT default across re-runs,
  // rather than being pinned by a stale saved set.
  test("a column whose default flips to optional is re-hidden when untouched", () => {
    expect(hiddenIds(computeHiddenColumnsV2([col("flip")], null, null))).toEqual([]);
    expect(hiddenIds(computeHiddenColumnsV2([col("flip", "optional")], null, null))).toEqual([
      "flip",
    ]);
  });

  // Forced-hidden (`visibility: "hidden"`) columns are dropped from the visible table,
  // matching V3 and the grid (delegates to computeHiddenColumns). Guards against
  // regressing V2 back to leaving them in.
  test("a forced-hidden column is hidden", () => {
    expect(hiddenIds(computeHiddenColumnsV2([col("forced", "hidden")], null, null))).toEqual([
      "forced",
    ]);
  });

  // Axis references in the override lists are ignored (only column overrides apply).
  test("axis-type override entries are ignored", () => {
    const cols = [col("a")];
    const axisRef = { type: "axis", id: { name: "x" } } as unknown as PTableColumnId;
    expect(hiddenIds(computeHiddenColumnsV2(cols, [axisRef], null))).toEqual([]);
  });
});
