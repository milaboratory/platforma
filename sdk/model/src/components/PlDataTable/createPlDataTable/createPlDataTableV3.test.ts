import {
  Annotation,
  type PColumnSpec,
  type PObjectId,
  type PTableColumnId,
  type PTableSorting,
} from "@milaboratories/pl-model-common";
import { describe, expect, test } from "vitest";
import { computeHiddenColumns } from "./createPlDataTableV3";

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

describe("computeHiddenColumns", () => {
  test("with no saved overrides, hides forced-hidden and optional columns and shows the rest", () => {
    const cols = [col("visible"), col("opt", "optional"), col("hid", "hidden")];
    expect(hiddenIds(computeHiddenColumns(cols, null, null, null, null))).toEqual(["hid", "opt"]);
  });

  test("a user-hidden column (block default visible) becomes hidden", () => {
    const cols = [col("a"), col("b")];
    expect(hiddenIds(computeHiddenColumns(cols, null, null, [colRef("a")], null))).toEqual(["a"]);
  });

  test("a user-shown column (block default optional) becomes visible", () => {
    const cols = [col("a", "optional"), col("b", "optional")];
    expect(hiddenIds(computeHiddenColumns(cols, null, null, null, [colRef("a")]))).toEqual(["b"]);
  });

  test("show overrides win over hide overrides", () => {
    const cols = [col("a")];
    expect(hiddenIds(computeHiddenColumns(cols, null, null, [colRef("a")], [colRef("a")]))).toEqual(
      [],
    );
  });

  test("forced-hidden columns stay hidden even when the user showed them", () => {
    const cols = [col("a", "hidden")];
    expect(hiddenIds(computeHiddenColumns(cols, null, null, null, [colRef("a")]))).toEqual(["a"]);
  });

  // MILAB-6002 regression: an untouched column follows its CURRENT default across
  // re-runs, rather than being pinned by a stale saved hidden set.
  test("a column whose default flips to optional is re-hidden when untouched", () => {
    expect(hiddenIds(computeHiddenColumns([col("flip")], null, null, null, null))).toEqual([]);
    expect(
      hiddenIds(computeHiddenColumns([col("flip", "optional")], null, null, null, null)),
    ).toEqual(["flip"]);
  });

  test("sorted columns are force-kept visible even when optional", () => {
    const cols = [col("a", "optional")];
    const sorting = [{ column: colRef("a") }] as unknown as PTableSorting[];
    expect(hiddenIds(computeHiddenColumns(cols, sorting, null, null, null))).toEqual([]);
  });
});
