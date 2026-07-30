import { describe, expect, test } from "vitest";
import type {
  AxisSpec,
  PColumnSpec,
  PObjectId,
  SpecOverrides,
} from "@milaboratories/pl-model-common";
import type { PColumnDataUniversal } from "../render/internal";
import { DataColumnImpl, type DataColumnRecipe } from "./data_column";
import { ColumnFilteredRecipe } from "./column_recipes/column_filtered_recipe";
import { ColumnOverriddenRecipe } from "./column_recipes/column_overrided_recipe";
import { hasReachableData, hasSingleDataColumn } from "./utils";

// --- Helpers ---

const axis = (name: string): AxisSpec => ({ name, type: "String" }) as AxisSpec;

const twoAxisSpec: PColumnSpec = {
  kind: "PColumn",
  name: "count",
  valueType: "Int",
  axesSpec: [axis("sampleId"), axis("clonotypeKey")],
  annotations: {},
} as PColumnSpec;

const overrides = (patch: Partial<SpecOverrides>): SpecOverrides => ({
  annotations: patch.annotations ?? {},
  domain: patch.domain ?? {},
  contextDomain: patch.contextDomain ?? {},
  axesSpec: patch.axesSpec ?? {},
});

const DATA = { marker: "leaf-data" } as unknown as PColumnDataUniversal;

const leaf = () =>
  DataColumnImpl.fromColumn({
    id: "leafId" as PObjectId,
    spec: twoAxisSpec,
    data: DATA,
  });

// ════════════════════════════════════════════════════════════════════════════
// hasReachableData — "can I read this column's data, consistent with its spec?"
// ════════════════════════════════════════════════════════════════════════════

describe("hasReachableData", () => {
  test("bare leaf: true, and getData returns the leaf payload", () => {
    const col = leaf();
    expect(hasReachableData(col)).toBe(true);
    if (!hasReachableData(col)) throw new Error("unreachable");
    expect(col.getData()).toBe(DATA);
  });

  test("override over a leaf: true — a spec patch never reshapes data", () => {
    const col = ColumnOverriddenRecipe.wrap(leaf(), overrides({ annotations: { tag: "1" } }));
    expect(hasReachableData(col)).toBe(true);
    if (!hasReachableData(col)) throw new Error("unreachable");
    expect(col.getData()).toBe(DATA);
    // The patch landed on the spec while the data stayed the leaf's.
    expect(col.getSpec().annotations?.tag).toBe("1");
    expect(col.getSpec().axesSpec).toHaveLength(2);
  });

  test("axis-filtered leaf: false — spec drops an axis the data still carries", () => {
    const filtered = ColumnFilteredRecipe.wrap(leaf(), [[0, "s1"]]);
    // The mismatch this guards against: one axis in the spec, two in the data.
    expect(filtered.getSpec().axesSpec).toHaveLength(1);
    expect(hasReachableData(filtered)).toBe(false);
  });

  test("override over an axis-filtered leaf: false", () => {
    const filtered = ColumnFilteredRecipe.wrap(leaf(), [[0, "s1"]]);
    const col = ColumnOverriddenRecipe.wrap(filtered, overrides({ annotations: { tag: "1" } }));
    expect(hasReachableData(col)).toBe(false);
  });

  test("an unreadable override has no getData at all — nothing to call, nothing to throw", () => {
    const filtered = ColumnFilteredRecipe.wrap(leaf(), [[0, "s1"]]);
    const col = ColumnOverriddenRecipe.wrap(filtered, overrides({ annotations: { tag: "1" } }));
    expect((col as Partial<DataColumnRecipe>).getData).toBeUndefined();
  });

  test("merging overrides keeps the readable variant", () => {
    const once = leaf().withSpecs(overrides({ annotations: { a: "1" } }));
    const twice = once.withSpecs(overrides({ annotations: { b: "2" } }));
    expect(hasReachableData(twice)).toBe(true);
    if (!hasReachableData(twice)) throw new Error("unreachable");
    expect(twice.getData()).toBe(DATA);
    expect(twice.getSpec().annotations).toMatchObject({ a: "1", b: "2" });
  });

  test("merging overrides does not resurrect readability over a filtered leaf", () => {
    const filtered = ColumnFilteredRecipe.wrap(leaf(), [[0, "s1"]]);
    const twice = filtered
      .withSpecs(overrides({ annotations: { a: "1" } }))
      .withSpecs(overrides({ annotations: { b: "2" } }));
    expect(hasReachableData(twice)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// hasSingleDataColumn — "does this column read one data column, or several?"
// ════════════════════════════════════════════════════════════════════════════

describe("hasSingleDataColumn", () => {
  test("bare leaf, override and axis filter all read a single data column", () => {
    const bare = leaf();
    const filtered = ColumnFilteredRecipe.wrap(leaf(), [[0, "s1"]]);
    const overridden = ColumnOverriddenRecipe.wrap(filtered, overrides({ domain: { d: "1" } }));

    expect(hasSingleDataColumn(bare)).toBe(true);
    expect(hasSingleDataColumn(filtered)).toBe(true);
    expect(hasSingleDataColumn(overridden)).toBe(true);
  });

  test("is a different question from hasReachableData", () => {
    const filtered = ColumnFilteredRecipe.wrap(leaf(), [[0, "s1"]]);
    // Reads a single data column, yet its data is not reachable here (the
    // slice happens engine-side). Conflating the two is the bug this pair of
    // predicates replaced.
    expect(hasSingleDataColumn(filtered)).toBe(true);
    expect(hasReachableData(filtered)).toBe(false);
  });
});
