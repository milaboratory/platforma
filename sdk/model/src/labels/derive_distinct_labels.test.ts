import {
  Annotation,
  type AxisQualification,
  type PColumnSpec,
  type PObjectId,
} from "@milaboratories/pl-model-common";
import { describe, expect, test } from "vitest";
import { deriveDistinctLabels, type Entry, type Trace } from "./derive_distinct_labels";

function tracesToSpecs(traces: Trace[]) {
  return traces.map(
    (t) =>
      ({
        kind: "PColumn",
        name: "name",
        valueType: "Int",
        annotations: {
          [Annotation.Trace]: JSON.stringify(t),
          [Annotation.Label]: "Label",
        },
        axesSpec: [],
      }) satisfies PColumnSpec,
  );
}

function createSpec(overrides: Partial<PColumnSpec> = {}): PColumnSpec {
  return {
    kind: "PColumn",
    name: "name",
    valueType: "Int",
    annotations: {},
    axesSpec: [],
    ...overrides,
  } as PColumnSpec;
}
test.each<{ name: string; traces: Trace[]; labels: string[] }>([
  {
    name: "simple",
    traces: [[{ type: "t1", label: "L1" }], [{ type: "t1", label: "L2" }]],
    labels: ["L1", "L2"],
  },
  {
    name: "later wins",
    traces: [
      [
        { type: "t1", label: "T1L1" },
        { type: "t2", label: "T2L1" },
      ],
      [
        { type: "t1", label: "T1L2" },
        { type: "t2", label: "T2L2" },
      ],
    ],
    labels: ["T2L1", "T2L2"],
  },
  {
    name: "importance wins",
    traces: [
      [
        { type: "t1", importance: 100, label: "T1L1" },
        { type: "t2", label: "T2L1" },
      ],
      [
        { type: "t1", importance: 100, label: "T1L2" },
        { type: "t2", label: "T2L2" },
      ],
    ],
    labels: ["T1L1", "T1L2"],
  },
  {
    name: "uniqueness wins",
    traces: [
      [
        { type: "t1", label: "T1L1" },
        { type: "t2", label: "T2L1" },
      ],
      [
        { type: "t1", label: "T1L2" },
        { type: "t2", label: "T2L1" },
      ],
    ],
    labels: ["T1L1", "T1L2"],
  },
  {
    name: "combinatoric solution",
    traces: [
      [
        { type: "t1", label: "T1L1" },
        { type: "t2", label: "T2L1" },
      ],
      [
        { type: "t1", label: "T1L1" },
        { type: "t2", label: "T2L2" },
      ],
      [
        { type: "t1", label: "T1L2" },
        { type: "t2", label: "T2L2" },
      ],
    ],
    labels: ["T1L1 / T2L1", "T1L1 / T2L2", "T1L2 / T2L2"],
  },
  {
    name: "different importance and id",
    traces: [
      [{ type: "sameType", importance: 10, id: "id1", label: "High importance" }],
      [{ type: "sameType", importance: 5, id: "id2", label: "Low importance" }],
    ],
    labels: ["High importance", "Low importance"],
  },
  {
    name: "mixed common and different entries",
    traces: [
      [
        { type: "commonType", importance: 1, id: "common", label: "Common entry" },
        { type: "uniqueType", importance: 10, id: "id1", label: "Unique entry 1" },
      ],
      [
        { type: "commonType", importance: 1, id: "common", label: "Common entry" },
        { type: "uniqueType", importance: 5, id: "id2", label: "Unique entry 2" },
      ],
    ],
    labels: ["Unique entry 1", "Unique entry 2"],
  },
])("test label derivation: $name", ({ traces, labels }) => {
  expect(deriveDistinctLabels(tracesToSpecs(traces))).toEqual(labels);
  expect(deriveDistinctLabels(tracesToSpecs(traces), { includeNativeLabel: true })).toEqual(
    labels.map((l) => "Label / " + l),
  );
});

test("test fallback to native labels in label derivation", () => {
  expect(deriveDistinctLabels(tracesToSpecs([[], []]))).toEqual(["Label", "Label"]);
});

test.each<{ name: string; traces: Trace[]; labels: string[] }>([
  {
    name: "removes redundant low-importance type when high-importance alone suffices",
    traces: [
      [
        { type: "t1", importance: 10, label: "High1" },
        { type: "t2", importance: 1, label: "Low1" },
      ],
      [
        { type: "t1", importance: 10, label: "High2" },
        { type: "t2", importance: 1, label: "Low2" },
      ],
    ],
    // Both t1 and t2 distinguish, but t2 (low importance) should be removed since t1 alone suffices
    labels: ["High1", "High2"],
  },
  {
    name: "keeps both types when both are needed for uniqueness",
    traces: [
      [
        { type: "t1", importance: 10, label: "A" },
        { type: "t2", importance: 1, label: "X" },
      ],
      [
        { type: "t1", importance: 10, label: "A" },
        { type: "t2", importance: 1, label: "Y" },
      ],
      [
        { type: "t1", importance: 10, label: "B" },
        { type: "t2", importance: 1, label: "Y" },
      ],
    ],
    // Neither t1 nor t2 alone can distinguish all three, need both
    labels: ["A / X", "A / Y", "B / Y"],
  },
  {
    name: "removes multiple redundant types greedily",
    traces: [
      [
        { type: "t1", importance: 100, label: "Unique1" },
        { type: "t2", importance: 10, label: "Same" },
        { type: "t3", importance: 1, label: "Same" },
      ],
      [
        { type: "t1", importance: 100, label: "Unique2" },
        { type: "t2", importance: 10, label: "Same" },
        { type: "t3", importance: 1, label: "Same" },
      ],
    ],
    // t1 alone distinguishes; t2 and t3 are redundant and should be removed
    labels: ["Unique1", "Unique2"],
  },
  {
    name: "fallback case: removes types that do not reduce cardinality",
    traces: [
      // Two columns with identical traces - cannot be distinguished
      [
        { type: "t1", importance: 100, label: "A" },
        { type: "t2", importance: 10, label: "X" },
        { type: "t3", importance: 1, label: "Same" },
      ],
      [
        { type: "t1", importance: 100, label: "A" },
        { type: "t2", importance: 10, label: "X" },
        { type: "t3", importance: 1, label: "Same" },
      ],
      // Third column is different
      [
        { type: "t1", importance: 100, label: "B" },
        { type: "t2", importance: 10, label: "Y" },
        { type: "t3", importance: 1, label: "Same" },
      ],
    ],
    // Cannot achieve full uniqueness (2 columns are identical), but t3 (Same) can be removed
    // since it doesn't help distinguish anything. t1 alone gives cardinality 2.
    labels: ["A", "A", "B"],
  },
])("test label minimization: $name", ({ traces, labels }) => {
  expect(deriveDistinctLabels(tracesToSpecs(traces))).toEqual(labels);
});

// Preset distilled from a real PlDataTable "all columns" dump: three columns whose native label is
// "Cluster Id", produced by two different clustering analyses (foldseek 3D-structure clustering and
// mmseqs2 clonotype clustering). The two foldseek columns carry a byte-identical trace, so phase 1
// cannot tell them apart (a linker "via …" postfix does in the real pipeline); the mmseqs2 column
// differs by its last trace step. Regression guard for "distinguish by absence": minimization used
// to keep only ONE clustering type, leaving the other column a bare "Cluster Id" — unique only
// because it LACKED the peer's clustering step. Each column must instead surface its OWN step.
test("cluster-id preset: colliding columns are distinguished by a token they have, not by absence", () => {
  const clusterId = (trace: Trace): PColumnSpec => ({
    kind: "PColumn",
    name: "name",
    valueType: "String",
    annotations: { [Annotation.Trace]: JSON.stringify(trace), [Annotation.Label]: "Cluster Id" },
    axesSpec: [],
  });

  const provenance: Trace = [
    { type: "milaboratories.samples-and-data", importance: 10, label: "Samples & Data" },
    {
      type: "milaboratories.samples-and-data/dataset",
      importance: 100,
      label: "MB135 + Podocytes",
    },
    {
      type: "milaboratories.mixcr-amplicon-alignment",
      importance: 20,
      label: "MiXCR generic amplicon",
    },
    { type: "milaboratories.redefine-clonotypes", importance: 30, label: "Imputed VDJRegion aa" },
  ];
  const foldseek: Trace = [
    ...provenance,
    { type: "milaboratories.antibody-tcr-lead-selection", importance: 30, label: "Selected Leads" },
    {
      type: "milaboratories.3d-structure-prediction",
      importance: 20,
      label: "Camelid (VHH/nanobody) NBB2, CDRH3 ≤ 2.5 Å",
    },
    {
      type: "milaboratories.3d-structure-clustering.clustering",
      importance: 30,
      label: "Full Structure+AA, TM≥0.95, cov≥0.95",
    },
  ];
  const mmseqs2: Trace = [
    ...provenance,
    {
      type: "milaboratories.clonotype-clustering.clustering",
      importance: 30,
      label: "Imputed VDJRegion aa, BLOSUM62, ident:0.95, cov:0.95",
    },
  ];

  const entries: Entry[] = [clusterId(foldseek), clusterId(mmseqs2), clusterId(foldseek)];

  expect(deriveDistinctLabels(entries, { includeNativeLabel: true })).toEqual([
    "Cluster Id / Full Structure+AA, TM≥0.95, cov≥0.95",
    "Cluster Id / Imputed VDJRegion aa, BLOSUM62, ident:0.95, cov:0.95",
    "Cluster Id / Full Structure+AA, TM≥0.95, cov≥0.95",
  ]);
});

// The by-presence repair must patch ONLY the bare column's own label — never the shared global type
// set. Otherwise the token it adds for one group ("X2" needs "t") leaks onto every column that
// carries that type, including "Y" in an unrelated group, which should stay a bare "Y".
test("by-presence repair does not leak its token into other groups sharing that type", () => {
  const spec = (label: string, trace: Trace): PColumnSpec => ({
    kind: "PColumn",
    name: "name",
    valueType: "Int",
    annotations: { [Annotation.Trace]: JSON.stringify(trace), [Annotation.Label]: label },
    axesSpec: [],
  });

  const entries: Entry[] = [
    // Group X: minimization separates the two by the higher-importance "a" (X2 ends up bare),
    // then repair un-bares X2 with the token it actually has — "t".
    spec("X", [{ type: "a", importance: 10, label: "A1" }]),
    spec("X", [{ type: "t", importance: 1, label: "TX" }]),
    // Group Y: sole "Y" column, also carries "t". Must NOT inherit X2's repair token.
    spec("Y", [{ type: "t", importance: 1, label: "TY" }]),
  ];

  expect(deriveDistinctLabels(entries, { includeNativeLabel: true })).toEqual([
    "X / A1",
    "X / TX",
    "Y",
  ]);
});

test.each<{ name: string; traces: Trace[]; labels: string[]; forceTraceElements: string[] }>([
  {
    name: "force one element",
    traces: [
      [
        { type: "t1", label: "T1L1" },
        { type: "t2", label: "T2L1" },
      ],
      [
        { type: "t1", label: "T1L2" },
        { type: "t2", label: "T2L2" },
      ],
    ],
    labels: ["T1L1", "T1L2"],
    forceTraceElements: ["t1"],
  },
  {
    name: "force multiple elements",
    traces: [
      [
        { type: "t1", label: "T1L1" },
        { type: "t2", label: "T2L1" },
        { type: "t3", label: "T3L1" },
      ],
      [
        { type: "t1", label: "T1L2" },
        { type: "t2", label: "T2L2" },
        { type: "t3", label: "T3L2" },
      ],
    ],
    labels: ["T1L1 / T3L1", "T1L2 / T3L2"],
    forceTraceElements: ["t1", "t3"],
  },
  {
    name: "force element not in all traces",
    traces: [
      [
        { type: "t1", label: "T1L1" },
        { type: "t2", label: "T2L1" },
      ],
      [{ type: "t2", label: "T2L2" }],
    ],
    labels: ["T1L1 / T2L1", "T2L2"],
    forceTraceElements: ["t1"],
  },
  {
    name: "force element with includeNativeLabel",
    traces: [
      [
        { type: "t1", label: "T1L1" },
        { type: "t2", label: "T2L1" },
      ],
      [
        { type: "t1", label: "T1L2" },
        { type: "t2", label: "T2L2" },
      ],
    ],
    labels: ["T1L1", "T1L2"],
    forceTraceElements: ["t1"],
  },
])(
  "test label derivation with forceTraceElements: $name",
  ({ name, traces, labels, forceTraceElements }) => {
    expect(deriveDistinctLabels(tracesToSpecs(traces), { forceTraceElements })).toEqual(labels);

    if (name === "force element with includeNativeLabel") {
      expect(
        deriveDistinctLabels(tracesToSpecs(traces), {
          forceTraceElements,
          includeNativeLabel: true,
        }),
      ).toEqual(labels.map((l) => "Label / " + l));
    }
  },
);

test("Entry with extraTrace (suffix, default) appends to labels", () => {
  const spec = createSpec({
    annotations: {
      [Annotation.Trace]: JSON.stringify([{ type: "t1", label: "Base" }]),
    },
  });
  const entries: Entry[] = [
    { spec, extraTrace: [{ type: "suffix", label: "S1" }] },
    { spec, extraTrace: [{ type: "suffix", label: "S2" }] },
  ];
  const labels = deriveDistinctLabels(entries);
  expect(labels).toEqual(["S1", "S2"]);
});

test("Entry with extraTrace position prefix prepends to labels", () => {
  const spec = createSpec({
    annotations: {
      [Annotation.Trace]: JSON.stringify([{ type: "t1", label: "Base" }]),
    },
  });
  const entries: Entry[] = [
    { spec, extraTrace: [{ type: "prefix", label: "P1", position: "prefix" }] },
    { spec, extraTrace: [{ type: "prefix", label: "P2", position: "prefix" }] },
  ];
  const labels = deriveDistinctLabels(entries);
  expect(labels).toEqual(["P1", "P2"]);
});

test("linkerPath appends default 'via' suffix when needed for uniqueness", () => {
  const entries: Entry[] = [
    {
      spec: createSpec({
        annotations: { [Annotation.Trace]: JSON.stringify([{ type: "t1", label: "Col" }]) },
      }),
    },
    {
      spec: createSpec({
        annotations: { [Annotation.Trace]: JSON.stringify([{ type: "t1", label: "Col" }]) },
      }),
      linkerPath: [{ spec: createSpec({ annotations: { [Annotation.LinkLabel]: "MyLinker" } }) }],
    },
  ];
  const labels = deriveDistinctLabels(entries);
  expect(labels).toEqual(["Col", "Col via MyLinker"]);
});

test("linkerPath with multiple steps joins with ' > '", () => {
  const entries: Entry[] = [
    {
      spec: createSpec({
        annotations: { [Annotation.Trace]: JSON.stringify([{ type: "t1", label: "Col" }]) },
      }),
    },
    {
      spec: createSpec({
        annotations: { [Annotation.Trace]: JSON.stringify([{ type: "t1", label: "Col" }]) },
      }),
      linkerPath: [
        { spec: createSpec({ annotations: { [Annotation.LinkLabel]: "L1" } }) },
        { spec: createSpec({ annotations: { [Annotation.LinkLabel]: "L2" } }) },
      ],
    },
  ];
  const labels = deriveDistinctLabels(entries);
  // Minimal difference: the source-most hop L1 alone distinguishes the linked column from the bare
  // one, so the redundant L2 is dropped.
  expect(labels).toEqual(["Col", "Col via L1"]);
});

test("linkerPath skips steps without labels", () => {
  const entries: Entry[] = [
    {
      spec: createSpec({
        annotations: { [Annotation.Trace]: JSON.stringify([{ type: "t1", label: "Col" }]) },
      }),
    },
    {
      spec: createSpec({
        annotations: { [Annotation.Trace]: JSON.stringify([{ type: "t1", label: "Col" }]) },
      }),
      linkerPath: [
        { spec: createSpec() },
        { spec: createSpec({ annotations: { [Annotation.LinkLabel]: "L2" } }) },
      ],
    },
  ];
  const labels = deriveDistinctLabels(entries);
  expect(labels).toEqual(["Col", "Col via L2"]);
});

test("formatters.linker customizes the postfix zone", () => {
  const entries: Entry[] = [
    {
      spec: createSpec({
        annotations: { [Annotation.Trace]: JSON.stringify([{ type: "t1", label: "Col" }]) },
      }),
    },
    {
      spec: createSpec({
        annotations: { [Annotation.Trace]: JSON.stringify([{ type: "t1", label: "Col" }]) },
      }),
      linkerPath: [{ spec: createSpec({ annotations: { [Annotation.LinkLabel]: "L1" } }) }],
    },
  ];
  const labels = deriveDistinctLabels(entries, {
    formatters: {
      linker: ({ root, linkers }) =>
        `[${[root?.text, ...linkers.map((l) => l.text)].filter(Boolean).join(", ")}]`,
    },
  });
  expect(labels).toEqual(["Col", "Col [L1]"]);
});

test("formatters.linker returning undefined suppresses the postfix", () => {
  const entries: Entry[] = [
    {
      spec: createSpec({
        annotations: { [Annotation.Trace]: JSON.stringify([{ type: "t1", label: "Col" }]) },
      }),
      linkerPath: [{ spec: createSpec({ annotations: { [Annotation.LinkLabel]: "L1" } }) }],
    },
    {
      spec: createSpec({
        annotations: { [Annotation.Trace]: JSON.stringify([{ type: "t1", label: "Col" }]) },
      }),
      linkerPath: [{ spec: createSpec({ annotations: { [Annotation.LinkLabel]: "L2" } }) }],
    },
  ];
  const labels = deriveDistinctLabels(entries, { formatters: { linker: () => undefined } });
  // Suppressed → both keep the bare stem (collision left unresolved by the caller's choice).
  expect(labels).toEqual(["Col", "Col"]);
});

test("linkerPath falls back to Label when LinkLabel is absent", () => {
  const entries: Entry[] = [
    {
      spec: createSpec({
        annotations: { [Annotation.Trace]: JSON.stringify([{ type: "t1", label: "Col" }]) },
      }),
    },
    {
      spec: createSpec({
        annotations: { [Annotation.Trace]: JSON.stringify([{ type: "t1", label: "Col" }]) },
      }),
      linkerPath: [{ spec: createSpec({ annotations: { [Annotation.Label]: "FallbackLabel" } }) }],
    },
  ];
  const labels = deriveDistinctLabels(entries);
  expect(labels).toEqual(["Col", "Col via FallbackLabel"]);
});

test("formatters.native customizes label rendering", () => {
  const s = ((label: string) =>
    ({
      kind: "PColumn",
      name: "n",
      valueType: "Int",
      axesSpec: [],
      annotations: { [Annotation.Label]: label },
    }) as PColumnSpec)("Counts");
  const labels = deriveDistinctLabels([{ spec: s }, { spec: s }], {
    formatters: { native: (l) => `<<${l}>>` },
  });
  expect(labels).toEqual(["<<Counts>>", "<<Counts>>"]);
});

test("formatters.native returning undefined drops label entry", () => {
  const traces: Trace[] = [[{ type: "t1", label: "X" }], [{ type: "t1", label: "Y" }]];
  const labels = deriveDistinctLabels(tracesToSpecs(traces), {
    includeNativeLabel: true,
    formatters: { native: () => undefined },
  });
  expect(labels).toEqual(["X", "Y"]);
});

test("formatters.hitQualification customizes hit zone", () => {
  const s = {
    kind: "PColumn",
    name: "n",
    valueType: "Int",
    axesSpec: [],
    annotations: { [Annotation.Label]: "Expr" },
  } as PColumnSpec;
  const entries: Entry[] = [
    {
      spec: s,
      qualifications: {
        forQueries: {},
        forHit: [{ axis: { name: "gene" }, contextDomain: { gene: "BRCA1" } }],
      },
    },
    {
      spec: s,
      qualifications: {
        forQueries: {},
        forHit: [{ axis: { name: "gene" }, contextDomain: { gene: "TP53" } }],
      },
    },
  ];
  const labels = deriveDistinctLabels(entries, {
    formatters: { hitQualification: (qs) => `<hit:${qs[0].contextDomain.gene}>` },
  });
  expect(labels).toEqual(["Expr <hit:BRCA1>", "Expr <hit:TP53>"]);
});

test("formatters.anchorQualification receives anchorId", () => {
  const s = {
    kind: "PColumn",
    name: "n",
    valueType: "Int",
    axesSpec: [],
    annotations: { [Annotation.Label]: "Counts" },
  } as PColumnSpec;
  const A = "A" as PObjectId;
  const entries: Entry[] = [
    {
      spec: s,
      qualifications: {
        forQueries: { [A]: [{ axis: { name: "sample" }, contextDomain: { batch: "X" } }] },
        forHit: [],
      },
    },
    {
      spec: s,
      qualifications: {
        forQueries: { [A]: [{ axis: { name: "sample" }, contextDomain: { batch: "Y" } }] },
        forHit: [],
      },
    },
  ];
  const labels = deriveDistinctLabels(entries, {
    formatters: {
      anchorQualification: (id, qs) => `(${id}=${qs[0].contextDomain.batch})`,
    },
  });
  expect(labels).toEqual(["Counts (A=X)", "Counts (A=Y)"]);
});

// Deferred: linker-step qualifications are not yet consumed by phase 2 — to be restored with
// qualification support (see linked_column_postfix).
test.todo("linker-step qualifications control inline step quals");

test("addLabelAsSuffix places native label at the end", () => {
  const specs = tracesToSpecs([[{ type: "t1", label: "L1" }], [{ type: "t1", label: "L2" }]]);
  const labels = deriveDistinctLabels(specs, {
    includeNativeLabel: true,
    addLabelAsSuffix: true,
  });
  expect(labels).toEqual(["L1 / Label", "L2 / Label"]);
});

test("custom separator is used between label parts", () => {
  const specs = tracesToSpecs([
    [
      { type: "t1", label: "A" },
      { type: "t2", label: "X" },
    ],
    [
      { type: "t1", label: "A" },
      { type: "t2", label: "Y" },
    ],
    [
      { type: "t1", label: "B" },
      { type: "t2", label: "Y" },
    ],
  ]);
  const labels = deriveDistinctLabels(specs, { separator: " - " });
  expect(labels).toEqual(["A - X", "A - Y", "B - Y"]);
});

test("single value gets its trace label", () => {
  const specs = tracesToSpecs([[{ type: "t1", label: "Only" }]]);
  const labels = deriveDistinctLabels(specs);
  expect(labels).toEqual(["Only"]);
});

test("Unlabeled fallback when no trace entries match", () => {
  // Two identical specs with identical traces — fallback path
  const spec = createSpec({
    annotations: {
      [Annotation.Trace]: JSON.stringify([{ type: "t1", label: "Same" }]),
    },
  });
  // Remove native label so LABEL_TYPE is not added
  delete spec.annotations![Annotation.Label];

  const result = deriveDistinctLabels([spec, spec]);
  expect(result.every((r) => r === "Same")).toBe(true);
});

test("Unlabeled when no traces and no label", () => {
  const spec = createSpec();
  const result = deriveDistinctLabels([spec, spec]);
  expect(result.every((r) => r === "Unlabeled")).toBe(true);
});

test("repeated type occurrences are used as secondary types", () => {
  // Two records where "t1" appears twice in each, with different labels on 2nd occurrence
  const specs = tracesToSpecs([
    [
      { type: "t1", label: "First" },
      { type: "t1", label: "A" },
    ],
    [
      { type: "t1", label: "First" },
      { type: "t1", label: "B" },
    ],
  ]);
  const labels = deriveDistinctLabels(specs);
  // t1@1 has label "First" for both (same), t1@2 has "A" vs "B" (distinguishing)
  // t1@2 is secondary since it only appears when there are 2 occurrences
  expect(labels).toEqual(["A", "B"]);
});

test("spec without native label uses only trace entries", () => {
  const specs = [
    createSpec({
      annotations: {
        [Annotation.Trace]: JSON.stringify([{ type: "t1", label: "X" }]),
      },
    }),
    createSpec({
      annotations: {
        [Annotation.Trace]: JSON.stringify([{ type: "t1", label: "Y" }]),
      },
    }),
  ];
  const labels = deriveDistinctLabels(specs);
  expect(labels).toEqual(["X", "Y"]);
});

test("includeNativeLabel with no native label does not break", () => {
  const specs = [
    createSpec({
      annotations: {
        [Annotation.Trace]: JSON.stringify([{ type: "t1", label: "X" }]),
      },
    }),
    createSpec({
      annotations: {
        [Annotation.Trace]: JSON.stringify([{ type: "t1", label: "Y" }]),
      },
    }),
  ];
  const labels = deriveDistinctLabels(specs, { includeNativeLabel: true });
  expect(labels).toEqual(["X", "Y"]);
});

describe("deriveDistinctLabels v2 — linker path & qualifications", () => {
  function labeledSpec(label: string, name = "col"): PColumnSpec {
    return {
      kind: "PColumn",
      name,
      valueType: "Int",
      axesSpec: [],
      annotations: { [Annotation.Label]: label },
    } as PColumnSpec;
  }

  function linkerSpec(label: string, name = "linker"): PColumnSpec {
    return {
      kind: "PColumn",
      name,
      valueType: "Int",
      axesSpec: [],
      annotations: { [Annotation.LinkLabel]: label },
    } as PColumnSpec;
  }

  function qual(axis: string, ctx: Record<string, string> = {}): AxisQualification {
    return { axis: { name: axis }, contextDomain: ctx };
  }

  const A = "anchor-main" as PObjectId;
  const B = "anchor-other" as PObjectId;

  test("linkerPath not appended when name alone is unique", () => {
    const entries: Entry[] = [
      { spec: labeledSpec("Read counts") },
      { spec: labeledSpec("Coverage"), linkerPath: [{ spec: linkerSpec("Sample mapper") }] },
    ];
    expect(deriveDistinctLabels(entries)).toEqual(["Read counts", "Coverage"]);
  });

  test("linkerPath appended only when needed for uniqueness", () => {
    const entries: Entry[] = [
      { spec: labeledSpec("Read counts") },
      { spec: labeledSpec("Read counts"), linkerPath: [{ spec: linkerSpec("Sample mapper") }] },
    ];
    expect(deriveDistinctLabels(entries)).toEqual(["Read counts", "Read counts via Sample mapper"]);
  });

  test("linker suffix is NOT added to records whose native label is already unique, even when other records collide", () => {
    // Repro for "Cluster Id via Clone to cluster link" bug:
    // - "Representative Sequence" exists both as a direct column and via a linker → collision
    //   forces algorithm to include LINKER_TYPE in the type set.
    // - As a side effect, every linked entry gets the "via …" suffix appended — including
    //   ones whose native label ("Cluster Id") is unique and needs no disambiguation.
    const linker = linkerSpec("Clone to cluster link");
    const entries: Entry[] = [
      { spec: labeledSpec("Representative Sequence", "rep_direct") },
      {
        spec: labeledSpec("Representative Sequence", "rep_linked"),
        linkerPath: [{ spec: linker }],
      },
      { spec: labeledSpec("Cluster Id", "cluster_id"), linkerPath: [{ spec: linker }] },
    ];
    expect(deriveDistinctLabels(entries)).toEqual([
      "Representative Sequence",
      "Representative Sequence via Clone to cluster link",
      "Cluster Id",
    ]);
  });

  test("two linker paths → both get distinguishing via-suffix", () => {
    const s = labeledSpec("Counts");
    const entries: Entry[] = [
      { spec: s, linkerPath: [{ spec: linkerSpec("Path A") }] },
      { spec: s, linkerPath: [{ spec: linkerSpec("Path B") }] },
    ];
    expect(deriveDistinctLabels(entries)).toEqual(["Counts via Path A", "Counts via Path B"]);
  });

  test("multi-step paths render only the differing hop (shared hub dropped)", () => {
    const s = labeledSpec("Counts");
    const entries: Entry[] = [
      { spec: s, linkerPath: [{ spec: linkerSpec("Hub") }, { spec: linkerSpec("Tail X") }] },
      { spec: s, linkerPath: [{ spec: linkerSpec("Hub") }, { spec: linkerSpec("Tail Y") }] },
    ];
    // Minimal difference: the common "Hub" hop carries no distinction and is dropped.
    expect(deriveDistinctLabels(entries)).toEqual(["Counts via Tail X", "Counts via Tail Y"]);
  });

  test("hit qualifications used when nothing else differs", () => {
    const s = labeledSpec("Expression");
    const entries: Entry[] = [
      { spec: s, qualifications: { forQueries: {}, forHit: [qual("gene", { gene: "BRCA1" })] } },
      { spec: s, qualifications: { forQueries: {}, forHit: [qual("gene", { gene: "TP53" })] } },
    ];
    expect(deriveDistinctLabels(entries)).toEqual([
      "Expression [gene=BRCA1]",
      "Expression [gene=TP53]",
    ]);
  });

  test("per-anchor qualifications named by anchor key", () => {
    const s = labeledSpec("Counts");
    const entries: Entry[] = [
      {
        spec: s,
        qualifications: { forQueries: { [A]: [qual("sample", { batch: "X" })] }, forHit: [] },
      },
      {
        spec: s,
        qualifications: { forQueries: { [A]: [qual("sample", { batch: "Y" })] }, forHit: [] },
      },
    ];
    expect(deriveDistinctLabels(entries)).toEqual([
      "Counts [anchor-main: sample batch=X]",
      "Counts [anchor-main: sample batch=Y]",
    ]);
  });

  // Deferred with qualification support in phase 2 (see linked_column_postfix).
  test.todo("linker-step qualifications used to disambiguate identical linker labels");

  test("layers compose only as far as needed; no over-decoration", () => {
    const entries: Entry[] = [
      { spec: labeledSpec("Read counts") },
      { spec: labeledSpec("Coverage") },
      {
        spec: labeledSpec("Coverage"),
        qualifications: { forQueries: { [A]: [qual("sample", { batch: "X" })] }, forHit: [] },
      },
    ];
    expect(deriveDistinctLabels(entries)).toEqual([
      "Read counts",
      "Coverage",
      "Coverage [anchor-main: sample batch=X]",
    ]);
  });

  test("hit and anchor qualifications combined when both needed", () => {
    const s = labeledSpec("Counts");
    const entries: Entry[] = [
      {
        spec: s,
        qualifications: {
          forQueries: { [A]: [qual("sample", { batch: "X" })] },
          forHit: [qual("gene", { gene: "BRCA1" })],
        },
      },
      {
        spec: s,
        qualifications: {
          forQueries: { [A]: [qual("sample", { batch: "X" })] },
          forHit: [qual("gene", { gene: "TP53" })],
        },
      },
      {
        spec: s,
        qualifications: {
          forQueries: { [A]: [qual("sample", { batch: "Y" })] },
          forHit: [qual("gene", { gene: "BRCA1" })],
        },
      },
    ];
    expect(deriveDistinctLabels(entries)).toEqual([
      "Counts [anchor-main: sample batch=X] [gene=BRCA1]",
      "Counts [anchor-main: sample batch=X] [gene=TP53]",
      "Counts [anchor-main: sample batch=Y] [gene=BRCA1]",
    ]);
  });

  test("only distinctive anchor qualifications appear in the label", () => {
    const s = labeledSpec("Counts");
    const sharedB = [qual("project", { id: "P1" })];
    const entries: Entry[] = [
      {
        spec: s,
        qualifications: {
          forQueries: { [A]: [qual("sample", { batch: "X" })], [B]: sharedB },
          forHit: [],
        },
      },
      {
        spec: s,
        qualifications: {
          forQueries: { [A]: [qual("sample", { batch: "Y" })], [B]: sharedB },
          forHit: [],
        },
      },
    ];
    expect(deriveDistinctLabels(entries)).toEqual([
      "Counts [anchor-main: sample batch=X]",
      "Counts [anchor-main: sample batch=Y]",
    ]);
  });

  test("full decoration when every layer carries information", () => {
    const sA: PColumnSpec = {
      ...labeledSpec("Counts"),
      annotations: {
        [Annotation.Label]: "Counts",
        [Annotation.Trace]: JSON.stringify([{ type: "stage", label: "RNAseq" }]),
      },
    } as PColumnSpec;
    const sB: PColumnSpec = {
      ...labeledSpec("Counts"),
      annotations: {
        [Annotation.Label]: "Counts",
        [Annotation.Trace]: JSON.stringify([{ type: "stage", label: "ATACseq" }]),
      },
    } as PColumnSpec;
    const entries: Entry[] = [
      { spec: sA, linkerPath: [{ spec: linkerSpec("Mapper") }] },
      {
        spec: sA,
        linkerPath: [{ spec: linkerSpec("Mapper") }],
        qualifications: { forQueries: { [A]: [qual("sample", { batch: "X" })] }, forHit: [] },
      },
      { spec: sB, linkerPath: [{ spec: linkerSpec("Mapper") }] },
    ];
    // Stems already differ by trace/anchor-qual, so the shared "Mapper" linker is never needed.
    expect(deriveDistinctLabels(entries)).toEqual([
      "Counts / RNAseq",
      "Counts / RNAseq [anchor-main: sample batch=X]",
      "Counts / ATACseq",
    ]);
  });

  test("identical variants produce identical labels (cannot disambiguate)", () => {
    const s = labeledSpec("Counts");
    const entries: Entry[] = [{ spec: s }, { spec: s }];
    expect(deriveDistinctLabels(entries)).toEqual(["Counts", "Counts"]);
  });

  test("axis-only qualification (no contextDomain) renders as axis name", () => {
    const s = labeledSpec("Counts");
    const entries: Entry[] = [
      { spec: s, qualifications: { forQueries: { [A]: [qual("sample")] }, forHit: [] } },
      { spec: s, qualifications: { forQueries: { [A]: [qual("gene")] }, forHit: [] } },
    ];
    expect(deriveDistinctLabels(entries)).toEqual([
      "Counts [anchor-main: sample]",
      "Counts [anchor-main: gene]",
    ]);
  });
});
