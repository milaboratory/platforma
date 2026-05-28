import {
  Annotation,
  createGlobalPObjectId,
  type PColumnSpec,
  type PObjectId,
} from "@milaboratories/pl-model-common";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { deriveAllLabels, evaluateRules, type LabelableColumn } from "./utils";
import type { ColumnOrderRule, ColumnVisibilityRule } from "./createPlDataTableV3";
import { ColumnLazy } from "../../../columns";
import {
  createTestCollectionDriver,
  type TestCollectionDriverHandle,
} from "../../../columns/__test_helpers__/collection_driver";

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

  test("linkerPath flows into deriveDistinctLabels and produces the 'via' suffix", () => {
    const linkerSpec = makeSpec({
      name: "linker",
      annotations: { [Annotation.LinkLabel]: "ClusterA" },
    });
    const columns: LabelableColumn[] = [
      makeLabelableColumn(
        "c1",
        { name: "shared", annotations: { [Annotation.Label]: "Cluster size" } },
        [{ linker: { id: "lk" as PObjectId, spec: linkerSpec } as never }],
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

let driverHandle: TestCollectionDriverHandle;

beforeEach(() => {
  driverHandle = createTestCollectionDriver();
  driverHandle.installAmbientCtx();
});

afterEach(async () => {
  driverHandle.uninstallAmbientCtx();
  await driverHandle.dispose();
});

function gid(name: string): PObjectId {
  return createGlobalPObjectId("test-block", name);
}

function makeLazyColumn(name: string, spec: Partial<PColumnSpec> = {}): ColumnLazy {
  const s = makeSpec({ axesSpec: [{ name: "id", type: "String" }], ...spec });
  const id = gid(name);
  driverHandle.register([{ id, spec: s }]);
  return ColumnLazy.fromColumn({ id, spec: s, data: undefined as never });
}

describe("evaluateRules", () => {
  test("returns empty map when rules or columns are empty", () => {
    expect(evaluateRules([], [makeLazyColumn("c1")]).size).toBe(0);
    expect(
      evaluateRules<ColumnVisibilityRule>(
        [{ match: { name: "anything" }, visibility: "hidden" }],
        [],
      ).size,
    ).toBe(0);
  });

  test("evaluates selector rules via the columnsCollection service", () => {
    const rules: ColumnVisibilityRule[] = [
      { match: { name: "^note$" }, visibility: "hidden" },
      { match: { name: "^score$" }, visibility: "optional" },
    ];
    const columns = [
      makeLazyColumn("n", { name: "note" }),
      makeLazyColumn("s", { name: "score" }),
      makeLazyColumn("x", { name: "other" }),
    ];

    const result = evaluateRules(rules, columns);

    expect(result.get(gid("n"))?.visibility).toBe("hidden");
    expect(result.get(gid("s"))?.visibility).toBe("optional");
    expect(result.has(gid("x"))).toBe(false);
  });

  test("preserves original rule order with overlapping selector rules", () => {
    const rules: ColumnOrderRule[] = [
      { match: { name: "^alpha$" }, priority: 100 },
      { match: { name: "^alpha$" }, priority: 1 }, // shadowed by the earlier rule
      { match: { name: "^beta$" }, priority: 50 },
    ];
    const result = evaluateRules(rules, [
      makeLazyColumn("a", { name: "alpha" }),
      makeLazyColumn("b", { name: "beta" }),
    ]);

    expect(result.get(gid("a"))?.priority).toBe(100);
    expect(result.get(gid("b"))?.priority).toBe(50);
  });

  test("dedupes columns by id before building spec frame (no duplicate-key crash)", () => {
    const rules: ColumnVisibilityRule[] = [{ match: { name: "^dup$" }, visibility: "hidden" }];
    const dup = makeLazyColumn("d", { name: "dup" });

    const result = evaluateRules(rules, [dup, dup, dup]);

    expect(result.get(gid("d"))?.visibility).toBe("hidden");
  });
});
