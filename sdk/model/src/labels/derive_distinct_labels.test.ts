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

describe("shared distinctions over presence-only ones", () => {
  const col = (label: string, trace: Trace): PColumnSpec =>
    createSpec({
      annotations: { [Annotation.Label]: label, [Annotation.Trace]: JSON.stringify(trace) },
    });
  const dataset = { type: "dataset", label: "DS", importance: 100 };
  const seqCluster = { type: "seq-clustering", label: "Seq cluster", importance: 30 };
  const esmCluster = { type: "esm-clustering", label: "ESM2 cluster", importance: 30 };
  const enrichment = (label: string) => ({ type: "enrichment", label, importance: 35 });

  test("a group keeps its own shared distinction when another group pins a presence-only type", () => {
    // The clustering types stay in the global set for the Cluster Size pair, where they separate
    // only by presence. They would also separate the Enrichment Quality pair the same way and
    // push out each enrichment block's own label, which both of those columns carry.
    const specs = [
      col("Enrichment Quality", [dataset, seqCluster, enrichment("Enr seq")]),
      col("Enrichment Quality", [dataset, esmCluster, enrichment("Enr esm")]),
      col("Cluster Size", [dataset, seqCluster]),
      col("Cluster Size", [dataset, esmCluster]),
      col("UMAP1", []),
    ];
    expect(deriveDistinctLabels(specs)).toEqual([
      "Enrichment Quality / Enr seq",
      "Enrichment Quality / Enr esm",
      "Cluster Size / Seq cluster",
      "Cluster Size / ESM2 cluster",
      "UMAP1",
    ]);
  });

  test("a member whose shown parts are a subset of a peer's counts as bare", () => {
    // Two datasets keep the dataset in every name, so "CS / DS1" is not the bare label itself.
    const ds = (label: string) => ({ ...dataset, label });
    const specs = [
      col("CS", [ds("DS1"), seqCluster]),
      col("CS", [ds("DS1"), esmCluster]),
      col("X", [ds("DS1")]),
      col("X", [ds("DS2")]),
      col("UMAP1", []),
    ];
    expect(deriveDistinctLabels(specs)).toEqual([
      "CS / DS1 / Seq cluster",
      "CS / DS1 / ESM2 cluster",
      "X / DS1",
      "X / DS2",
      "UMAP1",
    ]);
  });

  test("re-labelled groups keep their qualification tags", () => {
    const anchor = "anc" as PObjectId;
    const qual = (k: string) => ({
      forQueries: { [anchor]: [{ axis: { name: "ax" }, contextDomain: { k } }] },
      forHit: [],
    });
    const entries: Entry[] = [
      { spec: col("EQ", [seqCluster, enrichment("e1")]), qualifications: qual("1") },
      { spec: col("EQ", [esmCluster, enrichment("e2")]), qualifications: qual("1") },
      { spec: col("CS", [seqCluster]), qualifications: qual("1") },
      { spec: col("CS", [seqCluster]), qualifications: qual("2") },
      { spec: col("CS", [esmCluster]), qualifications: qual("1") },
    ];
    expect(deriveDistinctLabels(entries)).toEqual([
      "EQ / e1 [anc: ax k=1]",
      "EQ / e2 [anc: ax k=1]",
      "CS / Seq cluster [anc: ax k=1]",
      "CS / Seq cluster [anc: ax k=2]",
      "CS / ESM2 cluster [anc: ax k=1]",
    ]);
  });

  test("bare names are fixed in groups spanning several samples", () => {
    const sample = (label: string) => ({ type: "sample", label, importance: 50 });
    const specs = [
      col("Count", [sample("S1"), seqCluster]),
      col("Count", [sample("S1"), esmCluster]),
      col("Count", [sample("S2"), seqCluster]),
      col("Count", [sample("S2"), esmCluster]),
      col("UMAP1", []),
    ];
    expect(deriveDistinctLabels(specs)).toEqual([
      "Count / S1 / Seq cluster",
      "Count / S1 / ESM2 cluster",
      "Count / S2 / Seq cluster",
      "Count / S2 / ESM2 cluster",
      "UMAP1",
    ]);
  });

  test("a low-importance shared part does not replace a more important own part", () => {
    const run = (label: string) => ({ type: "run", label, importance: 1 });
    const specs = [
      col("Score", [run("r1"), seqCluster]),
      col("Score", [run("r2"), esmCluster]),
      col("CS", [run("r1"), seqCluster]),
      col("CS", [run("r1"), esmCluster]),
      col("UMAP1", []),
    ];
    expect(deriveDistinctLabels(specs).slice(0, 2)).toEqual([
      "Score / Seq cluster",
      "Score / ESM2 cluster",
    ]);
  });

  test("when the shared re-naming would clash, the bare member still gets its own part", () => {
    const specs = [
      col("EQ", [seqCluster, enrichment("e1")]),
      col("EQ", [esmCluster, enrichment("e2")]),
      col("EQ / e1", []), // takes the name the shared re-naming would give the first column
      col("CS", [seqCluster]),
      col("CS", [esmCluster]),
      col("UMAP1", []),
    ];
    const labels = deriveDistinctLabels(specs);
    // The bare member adds the part of the same kind its peer shows: its clustering.
    expect(labels.slice(0, 2)).toEqual(["EQ / Seq cluster", "EQ / ESM2 cluster"]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  test("without a shown label, only bare labels get a part", () => {
    const specs = [
      col("EQ", [dataset, seqCluster, enrichment("e1")]),
      col("EQ", [dataset, esmCluster, enrichment("e2")]),
      col("CS", [dataset, seqCluster]),
      col("CS", [dataset, esmCluster]),
    ];
    expect(deriveDistinctLabels(specs)).toEqual([
      "DS / Seq cluster / e1",
      "DS / e2",
      "DS / Seq cluster",
      "DS / ESM2 cluster",
    ]);
  });

  test("without a shown label, unrelated columns get no suffix", () => {
    // One group spans the whole list here, so the picked part must not spread to other columns.
    const sample = (label: string) => ({ type: "sample", label, importance: 50 });
    const host = (label: string) => ({ type: "host", label, importance: 10 });
    const specs = [
      col("Same", [sample("S1"), host("H1")]),
      col("Same", [sample("S1"), { type: "x", label: "X", importance: 30 }]),
      col("Same", [sample("S2"), host("H2")]),
      col("Same", [sample("S3"), host("H3")]),
      col("Same", [sample("S4"), host("H4")]),
    ];
    expect(deriveDistinctLabels(specs)).toEqual(["S1 / H1", "S1 / X", "S2", "S3", "S4"]);
  });

  test("the part a bare member adds is shown by every member that carries it", () => {
    const sample = (label: string) => ({ type: "sample", label, importance: 50 });
    const specs = [
      col("data", [sample("S2")]),
      col("data", [sample("S1"), seqCluster]),
      col("data", [sample("S1"), esmCluster]),
      col("UMAP1", []),
    ];
    expect(deriveDistinctLabels(specs)).toEqual([
      "data / S2",
      "data / S1 / Seq cluster",
      "data / S1 / ESM2 cluster",
      "UMAP1",
    ]);
  });

  test("qualification tags never stand in for shared parts, and can be added to a bare label", () => {
    const anchor = "anc" as PObjectId;
    const qual = (k: string) => ({
      forQueries: { [anchor]: [{ axis: { name: "ax" }, contextDomain: { k } }] },
      forHit: [],
    });
    const run = (label: string) => ({ type: "run", label, importance: 1 });
    const tagged: Entry[] = [
      { spec: col("CS", [seqCluster]), qualifications: qual("1") },
      { spec: col("CS", [seqCluster]), qualifications: qual("2") },
      { spec: col("CS", [esmCluster]) },
      { spec: col("X", [seqCluster]) },
      { spec: col("X", [esmCluster]) },
    ];
    expect(deriveDistinctLabels(tagged).slice(0, 3)).toEqual([
      "CS / Seq cluster [anc: ax k=1]",
      "CS / Seq cluster [anc: ax k=2]",
      "CS / ESM2 cluster",
    ]);
    const onlyTag: Entry[] = [
      { spec: col("A", [run("run1")]) },
      { spec: col("A", []), qualifications: qual("1") },
      { spec: col("A", [run("run2")]) },
      { spec: col("UMAP1", []) },
    ];
    expect(deriveDistinctLabels(onlyTag).slice(0, 3)).toEqual([
      "A / run1",
      "A [anc: ax k=1]",
      "A / run2",
    ]);
  });

  test("qualification tags don't change which kind of part a bare label adds", () => {
    const anchor = "anc" as PObjectId;
    const qual = (k: string) => ({
      forQueries: { [anchor]: [{ axis: { name: "ax" }, contextDomain: { k } }] },
      forHit: [],
    });
    const sample = { type: "sample", label: "S1", importance: 50 };
    const seq = (label: string) => ({ ...seqCluster, label });
    const run = { type: "run", label: "R", importance: 40 };
    const entries: Entry[] = [
      { spec: col("D", [sample, seq("Seq cluster")]), qualifications: qual("1") },
      { spec: col("D", [sample, seq("Seq cluster 2")]), qualifications: qual("1") },
      { spec: col("D", [sample, run, esmCluster]) },
      { spec: col("D", [sample, seq("Seq cluster")]), qualifications: qual("2") },
      { spec: col("UMAP1", []) },
    ];
    expect(deriveDistinctLabels(entries)[2]).toBe("D / ESM2 cluster");
  });

  test("labels stay unique when different trace types share the same text", () => {
    const part = (type: string, label: string) => ({ type, label, importance: 10 });
    const specs = [
      col("L", [part("s1", "S"), part("x1", "X"), part("w", "W")]),
      col("L", [part("s1", "S"), part("x1", "X")]),
      col("L", [part("s1", "S"), part("t", "T")]),
      col("L", [part("s1", "S"), part("x2", "X")]),
      col("L", [part("q", "Q")]),
      col("L", [part("s2", "S")]),
      col("UMAP1", []),
    ];
    const labels = deriveDistinctLabels(specs);
    expect(new Set(labels).size).toBe(labels.length);
  });

  test("with no shared distinction, the bare member shows its own part", () => {
    // Same enrichment subtitle on both (e.g. identical defaults), different clusterings.
    const specs = [
      col("Enrichment Quality", [dataset, seqCluster, enrichment("Same default")]),
      col("Enrichment Quality", [dataset, esmCluster, enrichment("Same default")]),
      col("Cluster Size", [dataset, seqCluster]),
      col("Cluster Size", [dataset, esmCluster]),
      col("UMAP1", []), // a column without trace keeps native labels in, as in a graph frame
    ];
    expect(deriveDistinctLabels(specs)).toEqual([
      "Enrichment Quality / Seq cluster",
      "Enrichment Quality / ESM2 cluster",
      "Cluster Size / Seq cluster",
      "Cluster Size / ESM2 cluster",
      "UMAP1",
    ]);
  });
});
