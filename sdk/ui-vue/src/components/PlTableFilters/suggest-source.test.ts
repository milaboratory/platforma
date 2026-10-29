import {
  createGlobalPObjectId,
  type AxisSpec,
  type PColumnSpec,
  type PObjectId,
  type PTableColumnSpec,
} from "@platforma-sdk/model";
import { describe, expect, it } from "vitest";
import { resolveSuggestSource, TABLE_FILTER_TYPES } from "./suggest-source";

describe("TABLE_FILTER_TYPES", () => {
  it("offers list membership predicates", () => {
    expect(TABLE_FILTER_TYPES).toContain("inSet");
    expect(TABLE_FILTER_TYPES).toContain("notInSet");
  });
});

describe("resolveSuggestSource", () => {
  const sampleAxis = axisSpec("pl7.app/sampleId");
  const cloneAxis = axisSpec("pl7.app/vdj/clonotypeKey");
  const abundanceId = columnId("abundance");
  const countId = columnId("count");
  const cloneLabelId = columnId("cloneLabel");

  const columns: PTableColumnSpec[] = [
    { type: "axis", id: sampleAxis, spec: sampleAxis },
    { type: "axis", id: cloneAxis, spec: cloneAxis },
    { type: "column", id: abundanceId, spec: columnSpec("abundance", [sampleAxis, cloneAxis]) },
    { type: "column", id: countId, spec: columnSpec("count", [sampleAxis]) },
    { type: "column", id: cloneLabelId, spec: columnSpec("label", [cloneAxis]) },
  ];

  it("reads a data column through the column itself", () => {
    expect(resolveSuggestSource(columns, { type: "column", id: abundanceId }, 1)).toEqual({
      type: "column",
      columnId: abundanceId,
      axisIdx: 1,
    });
  });

  it("reads an axis through every column carrying it", () => {
    expect(resolveSuggestSource(columns, { type: "axis", id: sampleAxis }, undefined)).toEqual({
      type: "axis",
      axisSpec: sampleAxis,
      parentColumnIds: [abundanceId, countId],
    });
  });

  it("does not take a column without the axis as a parent", () => {
    const source = resolveSuggestSource(columns, { type: "axis", id: cloneAxis }, undefined);
    expect(source).toEqual({
      type: "axis",
      axisSpec: cloneAxis,
      parentColumnIds: [abundanceId, cloneLabelId],
    });
  });

  it("throws when no column carries the axis", () => {
    const orphanAxis = axisSpec("pl7.app/orphan");
    const withOrphan: PTableColumnSpec[] = [
      ...columns,
      { type: "axis", id: orphanAxis, spec: orphanAxis },
    ];
    expect(() =>
      resolveSuggestSource(withOrphan, { type: "axis", id: orphanAxis }, undefined),
    ).toThrow(/pl7\.app\/orphan/);
  });
});

function axisSpec(name: string): AxisSpec {
  return { name, type: "String" };
}

function columnSpec(name: string, axesSpec: AxisSpec[]): PColumnSpec {
  return { kind: "PColumn", name, valueType: "Int", axesSpec };
}

function columnId(name: string): PObjectId {
  return createGlobalPObjectId("block", name);
}
