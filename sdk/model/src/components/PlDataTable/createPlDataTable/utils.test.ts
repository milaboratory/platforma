import {
  Annotation,
  canonicalizeJson,
  getAxisId,
  type AxisId,
  type PColumnSpec,
  type PObjectId,
} from "@milaboratories/pl-model-common";
import { describe, expect, test } from "vitest";
import { deriveAllLabels, type LabelableColumn } from "./utils";

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

function makeLabelableColumn(
  id: string,
  spec: Partial<PColumnSpec> = {},
  linkerPath?: LabelableColumn["linkerPath"],
): LabelableColumn {
  return {
    id: id as PObjectId,
    spec: makeSpec(spec),
    linkerPath,
  };
}

function makeLabelColumn(
  axisSpec: PColumnSpec["axesSpec"][0],
  label: string,
): { readonly spec: PColumnSpec } {
  return {
    spec: makeSpec({
      name: "label-col",
      valueType: "String",
      annotations: { [Annotation.Label]: label },
      axesSpec: [axisSpec],
    }),
  };
}

function axisKey(axis: PColumnSpec["axesSpec"][0]): string {
  return canonicalizeJson<AxisId>(getAxisId(axis));
}

// ---------------------------------------------------------------------------
// deriveAllLabels
// ---------------------------------------------------------------------------

describe("deriveAllLabels", () => {
  test("returns column labels derived from deriveDistinctLabels", () => {
    const columns: LabelableColumn[] = [
      makeLabelableColumn("c1", {
        name: "alpha",
        annotations: { [Annotation.Label]: "Alpha" },
      }),
      makeLabelableColumn("c2", {
        name: "beta",
        annotations: { [Annotation.Label]: "Beta" },
      }),
    ];

    const result = deriveAllLabels({
      columns,
      labelColumns: [],
      deriveLabelsOptions: { includeNativeLabel: true },
    });

    expect(result["c1"]).toBe("Alpha");
    expect(result["c2"]).toBe("Beta");
  });

  test("returns axis labels from label columns when available", () => {
    const axis = { type: "String", name: "sample" } as const;
    const columns: LabelableColumn[] = [
      makeLabelableColumn("c1", {
        name: "score",
        axesSpec: [axis],
        annotations: { [Annotation.Label]: "Score" },
      }),
    ];
    const labelColumns = [makeLabelColumn(axis, "Sample Name")];

    const result = deriveAllLabels({
      columns,
      labelColumns,
      deriveLabelsOptions: { includeNativeLabel: true },
    });

    expect(result[axisKey(axis)]).toBe("Sample Name");
  });

  test("falls back to axis annotation when no label column matches", () => {
    const axis = { type: "String", name: "gene" } as const;
    const columns: LabelableColumn[] = [
      makeLabelableColumn("c1", {
        name: "expr",
        axesSpec: [{ ...axis, annotations: { [Annotation.Label]: "Gene ID" } }],
        annotations: { [Annotation.Label]: "Expression" },
      }),
    ];

    const result = deriveAllLabels({
      columns,
      labelColumns: [],
      deriveLabelsOptions: { includeNativeLabel: true },
    });

    expect(result[axisKey(axis)]).toBe("Gene ID");
  });

  test("axis with no label annotation and no label column gets 'Unlabeled'", () => {
    const axis = { type: "Int", name: "idx" } as const;
    const columns: LabelableColumn[] = [
      makeLabelableColumn("c1", {
        name: "val",
        axesSpec: [axis],
        annotations: { [Annotation.Label]: "Value" },
      }),
    ];

    const result = deriveAllLabels({
      columns,
      labelColumns: [],
      deriveLabelsOptions: { includeNativeLabel: true },
    });

    expect(result[axisKey(axis)]).toBe("Unlabeled");
  });

  test("deduplicates axes shared across columns", () => {
    const sharedAxis = { type: "String", name: "sample" } as const;
    const columns: LabelableColumn[] = [
      makeLabelableColumn("c1", {
        name: "score1",
        axesSpec: [sharedAxis],
        annotations: { [Annotation.Label]: "Score 1" },
      }),
      makeLabelableColumn("c2", {
        name: "score2",
        axesSpec: [sharedAxis],
        annotations: { [Annotation.Label]: "Score 2" },
      }),
    ];
    const labelColumns = [makeLabelColumn(sharedAxis, "Sample")];

    const result = deriveAllLabels({
      columns,
      labelColumns,
      deriveLabelsOptions: { includeNativeLabel: true },
    });

    // axis label appears once
    expect(result[axisKey(sharedAxis)]).toBe("Sample");
    // column labels are distinct
    expect(result["c1"]).toBe("Score 1");
    expect(result["c2"]).toBe("Score 2");
  });
});

// ---------------------------------------------------------------------------
// deriveAxisLabels (tested through deriveAllLabels)
// ---------------------------------------------------------------------------

describe("deriveAxisLabels via deriveAllLabels", () => {
  test("multiple axes each get their own label", () => {
    const axis1 = { type: "String", name: "sample" } as const;
    const axis2 = { type: "String", name: "chain" } as const;
    const columns: LabelableColumn[] = [
      makeLabelableColumn("c1", {
        name: "value",
        axesSpec: [axis1, axis2],
        annotations: { [Annotation.Label]: "Value" },
      }),
    ];
    const labelColumns = [
      makeLabelColumn(axis1, "Sample ID"),
      makeLabelColumn(axis2, "Chain Type"),
    ];

    const result = deriveAllLabels({
      columns,
      labelColumns,
      deriveLabelsOptions: { includeNativeLabel: true },
    });

    expect(result[axisKey(axis1)]).toBe("Sample ID");
    expect(result[axisKey(axis2)]).toBe("Chain Type");
  });

  test("label column overrides axis annotation", () => {
    const axis = {
      type: "String",
      name: "sample",
      annotations: { [Annotation.Label]: "Axis Annotation Label" },
    } as const;
    const columns: LabelableColumn[] = [
      makeLabelableColumn("c1", {
        name: "v",
        axesSpec: [axis],
        annotations: { [Annotation.Label]: "V" },
      }),
    ];
    const labelColumns = [makeLabelColumn({ type: "String", name: "sample" }, "Label Col Label")];

    const result = deriveAllLabels({
      columns,
      labelColumns,
      deriveLabelsOptions: { includeNativeLabel: true },
    });

    expect(result[axisKey(axis)]).toBe("Label Col Label");
  });

  // Regression: LabelableColumn.linkerPath used to be `linkerPath` while
  // deriveDistinctLabels.Entry expected `linkersPath`. Structural typing +
  // optional fields hid the mismatch from the type checker — the field flowed
  // through as "extra" and disambiguation silently broke. This asserts the
  // linker label reaches the output.
  test("linkerPath flows into deriveDistinctLabels and produces the 'via' suffix", () => {
    const linkerSpec = makeSpec({
      name: "linker",
      annotations: { [Annotation.LinkLabel]: "ClusterA" },
    });
    const columns: LabelableColumn[] = [
      makeLabelableColumn(
        "c1",
        { name: "shared", annotations: { [Annotation.Label]: "Cluster size" } },
        [{ spec: linkerSpec }],
      ),
      makeLabelableColumn("c2", {
        name: "shared",
        annotations: { [Annotation.Label]: "Cluster size" },
      }),
    ];

    const result = deriveAllLabels({
      columns,
      labelColumns: [],
      deriveLabelsOptions: { includeNativeLabel: true },
    });

    expect(result["c1"]).toContain("via ClusterA");
    expect(result["c2"]).not.toContain("via ");
  });
});
