import {
  Annotation,
  type AxisQualification,
  type PColumnSpec,
  type SUniversalPColumnId,
} from "@milaboratories/pl-model-common";
import { describe, expect, test } from "vitest";
import { deriveDistinctTooltips, type TooltipEntry } from "./derive_distinct_tooltips";
import type { ColumnSnapshot, MatchVariant } from "../columns";

function createSpec(name: string, label?: string): PColumnSpec {
  return {
    kind: "PColumn",
    name,
    valueType: "Int",
    axesSpec: [],
    annotations: label !== undefined ? { [Annotation.Label]: label } : {},
  } as PColumnSpec;
}

function axisQualification(
  axisName: string,
  contextDomain: Record<string, string>,
): AxisQualification {
  return { axis: { name: axisName }, contextDomain };
}

function linkerSnapshot(name: string, label?: string): ColumnSnapshot<SUniversalPColumnId> {
  return {
    id: `linker-${name}` as SUniversalPColumnId,
    spec: createSpec(name, label),
    dataStatus: "ready",
    data: undefined,
  };
}

function pathStep(
  linkerName: string,
  qualifications: AxisQualification[],
  label?: string,
): MatchVariant["path"][number] {
  return { linker: linkerSnapshot(linkerName, label), qualifications };
}

describe("deriveDistinctTooltips", () => {
  test("empty entry (no qualifications, no linker path) → undefined", () => {
    const entries: TooltipEntry[] = [{ spec: createSpec("col1") }];
    expect(deriveDistinctTooltips(entries)).toEqual([undefined]);
  });

  test("only header info but no sections → undefined (single section filtered)", () => {
    const entries: TooltipEntry[] = [
      {
        spec: createSpec("col1", "Column 1"),
        variantIndex: 1,
        variantCount: 1,
      },
    ];
    expect(deriveDistinctTooltips(entries)).toEqual([undefined]);
  });

  test("linker path produces Origin path section", () => {
    const entries: TooltipEntry[] = [
      {
        spec: createSpec("hit_col", "Hit Col"),
        linkerPath: [
          pathStep("linker_a", [axisQualification("sample", { batch: "A" })], "Linker A"),
        ],
      },
    ];
    const [tooltip] = deriveDistinctTooltips(entries);
    expect(tooltip).toBeDefined();
    expect(tooltip).toContain("Column: Hit Col");
    expect(tooltip).toContain("Origin path");
    expect(tooltip).toContain("linker 1: Linker A");
    expect(tooltip).toContain("qualifies: sample context: batch=A");
    expect(tooltip).toContain("hit column: Hit Col");
  });

  test("qualifications.forAnchors produces Anchors section", () => {
    const entries: TooltipEntry[] = [
      {
        spec: createSpec("col1", "Col 1"),
        qualifications: {
          forAnchors: {
            main: [axisQualification("sample", { batch: "A" })],
            other: [axisQualification("gene", { source: "X" })],
          },
          forHit: [],
        },
      },
    ];
    const [tooltip] = deriveDistinctTooltips(entries);
    expect(tooltip).toContain("Anchors (bound via this variant)");
    expect(tooltip).toContain("main   sample context: batch=A");
    expect(tooltip).toContain("other   gene context: source=X");
  });

  test("qualifications.forHit produces Hit section", () => {
    const entries: TooltipEntry[] = [
      {
        spec: createSpec("col1", "Col 1"),
        qualifications: {
          forAnchors: {},
          forHit: [axisQualification("sample", { batch: "B" })],
        },
      },
    ];
    const [tooltip] = deriveDistinctTooltips(entries);
    expect(tooltip).toContain("Hit column qualifications");
    expect(tooltip).toContain("sample context: batch=B");
  });

  test("distinctiveQualifications produces Distinctive section", () => {
    const entries: TooltipEntry[] = [
      {
        spec: createSpec("col1", "Col 1"),
        distinctiveQualifications: {
          forAnchors: { main: [axisQualification("sample", { batch: "A" })] },
          forHit: [axisQualification("gene", { source: "Y" })],
        },
      },
    ];
    const [tooltip] = deriveDistinctTooltips(entries);
    expect(tooltip).toContain("Distinctive (what separates this variant)");
    expect(tooltip).toContain("main: sample context: batch=A");
    expect(tooltip).toContain("hit: gene context: source=Y");
  });

  test("variantCount > 1 adds Variant N of M line in header", () => {
    const entries: TooltipEntry[] = [
      {
        spec: createSpec("col1", "Col 1"),
        variantIndex: 1,
        variantCount: 2,
        qualifications: {
          forAnchors: { main: [axisQualification("sample", { batch: "A" })] },
          forHit: [],
        },
      },
    ];
    const [tooltip] = deriveDistinctTooltips(entries);
    expect(tooltip).toContain("Variant: 1 of 2");
  });

  test("fallback to spec.name when no label annotation", () => {
    const entries: TooltipEntry[] = [
      {
        spec: createSpec("raw_name"),
        qualifications: {
          forAnchors: { main: [axisQualification("sample", { batch: "A" })] },
          forHit: [],
        },
      },
    ];
    const [tooltip] = deriveDistinctTooltips(entries);
    expect(tooltip).toContain("Column: raw_name");
  });

  test("axis qualification with empty contextDomain shows only axis name", () => {
    const entries: TooltipEntry[] = [
      {
        spec: createSpec("col1", "Col 1"),
        qualifications: {
          forAnchors: { main: [axisQualification("sample", {})] },
          forHit: [],
        },
      },
    ];
    const [tooltip] = deriveDistinctTooltips(entries);
    expect(tooltip).toContain("main   sample");
    expect(tooltip).not.toContain("context:");
  });

  test("empty forAnchors object → no Anchors section", () => {
    const entries: TooltipEntry[] = [
      {
        spec: createSpec("col1", "Col 1"),
        qualifications: { forAnchors: {}, forHit: [] },
        linkerPath: [pathStep("linker_a", [], "Linker A")],
      },
    ];
    const [tooltip] = deriveDistinctTooltips(entries);
    expect(tooltip).not.toContain("Anchors");
  });

  test("multi-step linker path numbers sequentially", () => {
    const entries: TooltipEntry[] = [
      {
        spec: createSpec("hit_col", "Hit Col"),
        linkerPath: [
          pathStep("linker_a", [], "Linker A"),
          pathStep("linker_b", [axisQualification("sample", { batch: "B" })], "Linker B"),
        ],
      },
    ];
    const [tooltip] = deriveDistinctTooltips(entries);
    expect(tooltip).toContain("linker 1: Linker A");
    expect(tooltip).toContain("linker 2: Linker B");
  });

  test("all sections compose with double-newline separators", () => {
    const entries: TooltipEntry[] = [
      {
        spec: createSpec("hit_col", "Hit"),
        variantIndex: 2,
        variantCount: 2,
        linkerPath: [pathStep("linker_a", [axisQualification("sample", { batch: "B" })], "LA")],
        qualifications: {
          forAnchors: { main: [axisQualification("sample", { batch: "B" })] },
          forHit: [axisQualification("sample", { batch: "B" })],
        },
        distinctiveQualifications: {
          forAnchors: { main: [axisQualification("sample", { batch: "B" })] },
          forHit: [],
        },
      },
    ];
    const [tooltip] = deriveDistinctTooltips(entries);
    expect(tooltip).toBeDefined();
    const sections = tooltip!.split("\n\n");
    expect(sections.length).toBe(5);
    expect(sections[0]).toContain("Column: Hit");
    expect(sections[0]).toContain("Variant: 2 of 2");
    expect(sections[1]).toContain("Origin path");
    expect(sections[2]).toContain("Anchors");
    expect(sections[3]).toContain("Hit column qualifications");
    expect(sections[4]).toContain("Distinctive");
  });

  test("parallel results — array aligns with input", () => {
    const entries: TooltipEntry[] = [
      { spec: createSpec("a") },
      {
        spec: createSpec("b", "B"),
        qualifications: {
          forAnchors: { main: [axisQualification("sample", { batch: "A" })] },
          forHit: [],
        },
      },
      { spec: createSpec("c") },
    ];
    const result = deriveDistinctTooltips(entries);
    expect(result.length).toBe(3);
    expect(result[0]).toBeUndefined();
    expect(result[1]).toBeDefined();
    expect(result[2]).toBeUndefined();
  });
});
