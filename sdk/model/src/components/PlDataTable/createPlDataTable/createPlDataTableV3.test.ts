import type { PColumnSpec, PObjectId } from "@milaboratories/pl-model-common";
import type { ColumnSnapshot, ColumnDataStatus } from "../../../columns";
import { describe, expect, test } from "vitest";
import {
  normalizeEnrichmentConfig,
  normalizeTableColumnVariant,
  type TableColumnVariant,
} from "./createPlDataTableV3";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSpec(overrides: Partial<PColumnSpec> = {}): PColumnSpec {
  return {
    kind: "PColumn",
    name: "col",
    valueType: "Int",
    annotations: {},
    axesSpec: [],
    ...overrides,
  } as PColumnSpec;
}

function makeSnapshot(
  id: string,
  status: ColumnDataStatus = "ready",
  spec: Partial<PColumnSpec> = {},
): ColumnSnapshot<PObjectId> {
  return {
    id: id as PObjectId,
    spec: makeSpec(spec),
    dataStatus: status,
    data: { get: () => undefined },
  };
}

// ---------------------------------------------------------------------------
// normalizeEnrichmentConfig
// ---------------------------------------------------------------------------

describe("normalizeEnrichmentConfig", () => {
  test("`true` shorthand expands to optional with default discovery params", () => {
    expect(normalizeEnrichmentConfig(true)).toEqual({
      visibility: "optional",
      exclude: [],
      maxHops: 4,
      mode: "enrichment",
    });
  });

  test("'optional' string shorthand", () => {
    expect(normalizeEnrichmentConfig("optional")).toEqual({
      visibility: "optional",
      exclude: [],
      maxHops: 4,
      mode: "enrichment",
    });
  });

  test("'hidden' string shorthand", () => {
    expect(normalizeEnrichmentConfig("hidden").visibility).toBe("hidden");
  });

  test("'default' string shorthand", () => {
    expect(normalizeEnrichmentConfig("default").visibility).toBe("default");
  });

  test("object form fills in missing fields with documented defaults", () => {
    expect(normalizeEnrichmentConfig({})).toEqual({
      visibility: "optional",
      exclude: [],
      maxHops: 4,
      mode: "enrichment",
    });
  });

  test("object form preserves explicit overrides", () => {
    const exclude = [{ name: "x" }] as never;
    expect(
      normalizeEnrichmentConfig({
        visibility: "hidden",
        maxHops: 7,
        mode: "exact",
        exclude,
      }),
    ).toEqual({
      visibility: "hidden",
      maxHops: 7,
      mode: "exact",
      exclude,
    });
  });
});

// ---------------------------------------------------------------------------
// normalizeTableColumnVariant
// ---------------------------------------------------------------------------

describe("normalizeTableColumnVariant", () => {
  test("fills in all defaults when only `column` is provided", () => {
    const snap = makeSnapshot("c1");
    const result = normalizeTableColumnVariant({ column: snap });

    expect(result.column).toBe(snap);
    expect(result.path).toEqual([]);
    expect(result.qualifications).toEqual({ forHit: [], forQueries: {} });
    expect(result.originalId).toBe("c1");
    expect(result.isPrimary).toBe(true);
  });

  test("originalId defaults to column.id", () => {
    const snap = makeSnapshot("c1");
    const result = normalizeTableColumnVariant({ column: snap });
    expect(result.originalId).toBe(snap.id);
  });

  test("explicit fields override defaults", () => {
    const snap = makeSnapshot("c1");
    const linker = makeSnapshot("linker1");
    const variant: TableColumnVariant = {
      column: snap,
      path: [{ linker }],
      qualifications: { forHit: [], forQueries: { ["q1" as PObjectId]: [] } },
      originalId: "original-id" as PObjectId,
      isPrimary: false,
    };
    const result = normalizeTableColumnVariant(variant);

    expect(result.path).toHaveLength(1);
    expect(result.path[0].linker).toBe(linker);
    expect(result.qualifications.forQueries).toEqual({ ["q1" as PObjectId]: [] });
    expect(result.originalId).toBe("original-id");
    expect(result.isPrimary).toBe(false);
  });

  test("isPrimary explicitly set to false is preserved (not overridden by default true)", () => {
    const variant: TableColumnVariant = {
      column: makeSnapshot("c1"),
      isPrimary: false,
    };
    expect(normalizeTableColumnVariant(variant).isPrimary).toBe(false);
  });
});
