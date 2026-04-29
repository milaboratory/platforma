import { Annotation, type PColumnSpec, type PObjectId } from "@milaboratories/pl-model-common";
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
      deriveLabelsOptions: { includeNativeLabel: true },
    });

    expect(result["c1"]).toBe("Alpha");
    expect(result["c2"]).toBe("Beta");
  });

  test("does not produce axis labels", () => {
    const axis = { type: "String", name: "sample" } as const;
    const columns: LabelableColumn[] = [
      makeLabelableColumn("c1", {
        name: "score",
        axesSpec: [axis],
        annotations: { [Annotation.Label]: "Score" },
      }),
    ];

    const result = deriveAllLabels({
      columns,
      deriveLabelsOptions: { includeNativeLabel: true },
    });

    expect(Object.keys(result)).toEqual(["c1"]);
    expect(result["c1"]).toBe("Score");
  });

  test("distinct labels for columns sharing an axis", () => {
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

    const result = deriveAllLabels({
      columns,
      deriveLabelsOptions: { includeNativeLabel: true },
    });

    expect(result["c1"]).toBe("Score 1");
    expect(result["c2"]).toBe("Score 2");
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
        [{ linker: { id: "lk" as PObjectId, spec: linkerSpec } as never, qualifications: [] }],
      ),
      makeLabelableColumn("c2", {
        name: "shared",
        annotations: { [Annotation.Label]: "Cluster size" },
      }),
    ];

    const result = deriveAllLabels({
      columns,
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
