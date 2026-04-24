import {
  Annotation,
  canonicalizeJson,
  getAxisId,
  type AxisId,
  type PColumnSpec,
  type PObjectId,
} from "@milaboratories/pl-model-common";
import { SpecDriver } from "@milaboratories/pf-spec-driver";
import { describe, expect, test } from "vitest";
import { deriveAllLabels, evaluateRules, type LabelableColumn, type RuleColumn } from "./utils";
import type { ColumnOrderRule, ColumnVisibilityRule } from "./createPlDataTableV3";

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

// ---------------------------------------------------------------------------
// evaluateRules
// ---------------------------------------------------------------------------

function makeRuleColumn(id: string, spec: Partial<PColumnSpec> = {}): RuleColumn {
  return {
    id: id as PObjectId,
    spec: makeSpec({ axesSpec: [{ name: "id", type: "String" }], ...spec }),
  };
}

describe("evaluateRules", () => {
  test("returns empty map when rules or columns are empty", () => {
    const driver = new SpecDriver();
    expect(evaluateRules([], [makeRuleColumn("c1")], driver).size).toBe(0);
    expect(
      evaluateRules<ColumnVisibilityRule>([{ match: () => true, visibility: "hidden" }], [], driver)
        .size,
    ).toBe(0);
  });

  test("evaluates predicate rules without touching the driver", () => {
    const driver = new Proxy({} as SpecDriver, {
      get() {
        throw new Error("driver should not be called for predicate-only rules");
      },
    });

    const rules: ColumnOrderRule[] = [
      { match: (spec) => spec.name === "alpha", priority: 10 },
      { match: (spec) => spec.name === "beta", priority: 5 },
    ];
    const result = evaluateRules(
      rules,
      [
        makeRuleColumn("a", { name: "alpha" }),
        makeRuleColumn("b", { name: "beta" }),
        makeRuleColumn("c", { name: "gamma" }),
      ],
      driver,
    );

    expect(result.get("a" as PObjectId)?.priority).toBe(10);
    expect(result.get("b" as PObjectId)?.priority).toBe(5);
    expect(result.has("c" as PObjectId)).toBe(false);
  });

  test("evaluates selector rules via PFrameSpec.discoverColumns", () => {
    const driver = new SpecDriver();
    const rules: ColumnVisibilityRule[] = [
      { match: { name: "^note$" }, visibility: "hidden" },
      { match: { name: "^score$" }, visibility: "optional" },
    ];
    const columns = [
      makeRuleColumn("n", { name: "note" }),
      makeRuleColumn("s", { name: "score" }),
      makeRuleColumn("x", { name: "other" }),
    ];

    const result = evaluateRules(rules, columns, driver);

    expect(result.get("n" as PObjectId)?.visibility).toBe("hidden");
    expect(result.get("s" as PObjectId)?.visibility).toBe("optional");
    expect(result.has("x" as PObjectId)).toBe(false);
  });

  test("preserves original rule order when predicate and selector rules are mixed", () => {
    const driver = new SpecDriver();
    const rules: ColumnOrderRule[] = [
      { match: (spec) => spec.name === "alpha", priority: 100 },
      { match: { name: "^alpha$" }, priority: 1 }, // shadowed by the predicate above
      { match: { name: "^beta$" }, priority: 50 },
    ];
    const result = evaluateRules(
      rules,
      [makeRuleColumn("a", { name: "alpha" }), makeRuleColumn("b", { name: "beta" })],
      driver,
    );

    expect(result.get("a" as PObjectId)?.priority).toBe(100);
    expect(result.get("b" as PObjectId)?.priority).toBe(50);
  });

  test("dedupes columns by id before building spec frame (no duplicate-key crash)", () => {
    const driver = new SpecDriver();
    const rules: ColumnVisibilityRule[] = [{ match: { name: "^dup$" }, visibility: "hidden" }];
    const dup = makeRuleColumn("d", { name: "dup" });

    const result = evaluateRules(rules, [dup, dup, dup], driver);

    expect(result.get("d" as PObjectId)?.visibility).toBe("hidden");
  });
});
