import { describe, expect, test } from "vitest";
import type {
  AxisSpec,
  PColumnSpec,
  PObjectId,
  SpecOverrides,
} from "@milaboratories/pl-model-common";
import type { PColumnDataUniversal } from "../render/internal";
import { DataColumnImpl } from "./data_column";
import { ColumnFilteredRecipe } from "./column_recipes/column_filtered_recipe";
import { ColumnOverriddenRecipe } from "./column_recipes/column_overrided_recipe";
import { getLeafColumnData, hasDirectData, isSelfContained } from "./utils";

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
// hasDirectData — "can I read this column's data, consistent with its spec?"
// ════════════════════════════════════════════════════════════════════════════

describe("hasDirectData", () => {
  test("bare leaf: true, and getData returns the leaf payload", () => {
    const col = leaf();
    expect(hasDirectData(col)).toBe(true);
    if (!hasDirectData(col)) throw new Error("unreachable");
    expect(col.getData()).toBe(DATA);
  });

  test("override over a leaf: true — a spec patch never reshapes data", () => {
    const col = ColumnOverriddenRecipe.wrap(leaf(), overrides({ annotations: { tag: "1" } }));
    expect(hasDirectData(col)).toBe(true);
    if (!hasDirectData(col)) throw new Error("unreachable");
    expect(col.getData()).toBe(DATA);
    // The patch landed on the spec while the data stayed the leaf's.
    expect(col.getSpec().annotations?.tag).toBe("1");
    expect(col.getSpec().axesSpec).toHaveLength(2);
  });

  test("axis-filtered leaf: false — spec drops an axis the data still carries", () => {
    const filtered = ColumnFilteredRecipe.wrap(leaf(), [[0, "s1"]]);
    // The mismatch this guards against: one axis in the spec, two in the data.
    expect(filtered.getSpec().axesSpec).toHaveLength(1);
    expect(hasDirectData(filtered)).toBe(false);
  });

  test("override over an axis-filtered leaf: false", () => {
    const filtered = ColumnFilteredRecipe.wrap(leaf(), [[0, "s1"]]);
    const col = ColumnOverriddenRecipe.wrap(filtered, overrides({ annotations: { tag: "1" } }));
    expect(hasDirectData(col)).toBe(false);
  });

  test("ColumnOverriddenRecipe.getData throws when the inner carries no readable data", () => {
    const filtered = ColumnFilteredRecipe.wrap(leaf(), [[0, "s1"]]);
    const col = ColumnOverriddenRecipe.wrap(filtered, overrides({ annotations: { tag: "1" } }));
    expect(() => col.getData()).toThrow(/no directly readable data/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// isSelfContained — "does this column need other columns to resolve?"
// ════════════════════════════════════════════════════════════════════════════

describe("isSelfContained", () => {
  test("bare leaf, override and axis filter are all self-contained", () => {
    const bare = leaf();
    const filtered = ColumnFilteredRecipe.wrap(leaf(), [[0, "s1"]]);
    const overridden = ColumnOverriddenRecipe.wrap(filtered, overrides({ domain: { d: "1" } }));

    expect(isSelfContained(bare)).toBe(true);
    expect(isSelfContained(filtered)).toBe(true);
    expect(isSelfContained(overridden)).toBe(true);
  });

  test("is a different question from hasDirectData", () => {
    const filtered = ColumnFilteredRecipe.wrap(leaf(), [[0, "s1"]]);
    // Self-contained (no other column needed) yet not directly readable
    // (the slice happens engine-side). Conflating the two is the bug this
    // pair of predicates replaced.
    expect(isSelfContained(filtered)).toBe(true);
    expect(hasDirectData(filtered)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Regression: the deprecated reader must not hand back unsliced data
// ════════════════════════════════════════════════════════════════════════════

describe("getLeafColumnData (deprecated)", () => {
  test("returns undefined for an axis-filtered recipe instead of the unsliced leaf data", () => {
    const filtered = ColumnFilteredRecipe.wrap(leaf(), [[0, "s1"]]);
    expect(getLeafColumnData(filtered)).toBeUndefined();
  });

  test("still reads through an override over a leaf", () => {
    const col = ColumnOverriddenRecipe.wrap(leaf(), overrides({ annotations: { tag: "1" } }));
    expect(getLeafColumnData(col)).toBe(DATA);
  });
});
