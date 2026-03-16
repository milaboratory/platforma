import { Annotation, type PColumnSpec } from "@milaboratories/pl-model-common";
import { expect, test } from "vitest";
import { deriveLabels, type Entry, type Trace } from "./derive_labels";

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
  expect(deriveLabels(tracesToSpecs(traces)).map((r) => r.label)).toEqual(labels);
  expect(
    deriveLabels(tracesToSpecs(traces), { includeNativeLabel: true }).map((r) => r.label),
  ).toEqual(labels.map((l) => "Label / " + l));
});

test("test fallback to native labels in label derivation", () => {
  expect(deriveLabels(tracesToSpecs([[], []])).map((r) => r.label)).toEqual(["Label", "Label"]);
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
  expect(deriveLabels(tracesToSpecs(traces)).map((r) => r.label)).toEqual(labels);
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
    expect(deriveLabels(tracesToSpecs(traces), { forceTraceElements }).map((r) => r.label)).toEqual(
      labels,
    );

    if (name === "force element with includeNativeLabel") {
      expect(
        deriveLabels(tracesToSpecs(traces), {
          forceTraceElements,
          includeNativeLabel: true,
        }).map((r) => r.label),
      ).toEqual(labels.map((l) => "Label / " + l));
    }
  },
);

// --- Entry with { spec, prefixTrace, suffixTrace } ---

test("Entry with prefixTrace prepends to labels", () => {
  const spec = createSpec({
    annotations: {
      [Annotation.Trace]: JSON.stringify([{ type: "t1", label: "Base" }]),
    },
  });
  const entries: Entry[] = [
    { spec, prefixTrace: [{ type: "prefix", label: "P1" }] },
    { spec, prefixTrace: [{ type: "prefix", label: "P2" }] },
  ];
  const labels = deriveLabels(entries).map((r) => r.label);
  expect(labels).toEqual(["P1", "P2"]);
});

test("Entry with suffixTrace appends to labels", () => {
  const spec = createSpec({
    annotations: {
      [Annotation.Trace]: JSON.stringify([{ type: "t1", label: "Base" }]),
    },
  });
  const entries: Entry[] = [
    { spec, suffixTrace: [{ type: "suffix", label: "S1" }] },
    { spec, suffixTrace: [{ type: "suffix", label: "S2" }] },
  ];
  const labels = deriveLabels(entries).map((r) => r.label);
  expect(labels).toEqual(["S1", "S2"]);
});

test("Entry with both prefixTrace and suffixTrace", () => {
  const spec1 = createSpec({
    annotations: {
      [Annotation.Trace]: JSON.stringify([{ type: "base", label: "Same" }]),
    },
  });
  const entries: Entry[] = [
    {
      spec: spec1,
      prefixTrace: [{ type: "pfx", label: "Pre1" }],
      suffixTrace: [{ type: "sfx", label: "Suf1" }],
    },
    {
      spec: spec1,
      prefixTrace: [{ type: "pfx", label: "Pre2" }],
      suffixTrace: [{ type: "sfx", label: "Suf2" }],
    },
  ];
  const labels = deriveLabels(entries).map((r) => r.label);
  // suffix is later in the trace (higher positional importance), so it wins over prefix
  expect(labels).toEqual(["Suf1", "Suf2"]);
});

// --- addLabelAsSuffix ---

test("addLabelAsSuffix places native label at the end", () => {
  const specs = tracesToSpecs([[{ type: "t1", label: "L1" }], [{ type: "t1", label: "L2" }]]);
  const labels = deriveLabels(specs, { includeNativeLabel: true, addLabelAsSuffix: true }).map(
    (r) => r.label,
  );
  expect(labels).toEqual(["L1 / Label", "L2 / Label"]);
});

// --- separator ---

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
  const labels = deriveLabels(specs, { separator: " - " }).map((r) => r.label);
  expect(labels).toEqual(["A - X", "A - Y", "B - Y"]);
});

// --- single value ---

test("single value gets its trace label", () => {
  const specs = tracesToSpecs([[{ type: "t1", label: "Only" }]]);
  const labels = deriveLabels(specs).map((r) => r.label);
  expect(labels).toEqual(["Only"]);
});

// --- Unlabeled fallback ---

test("Unlabeled fallback when no trace entries match", () => {
  // Two identical specs with identical traces — fallback path
  const spec = createSpec({
    annotations: {
      [Annotation.Trace]: JSON.stringify([{ type: "t1", label: "Same" }]),
    },
  });
  // Remove native label so LABEL_TYPE is not added
  delete spec.annotations![Annotation.Label];

  const result = deriveLabels([spec, spec]);
  expect(result.every((r) => r.label === "Same")).toBe(true);
});

test("Unlabeled when no traces and no label", () => {
  const spec = createSpec();
  const result = deriveLabels([spec, spec]);
  expect(result.every((r) => r.label === "Unlabeled")).toBe(true);
});

// --- repeated type occurrences (secondaryTypes path) ---

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
  const labels = deriveLabels(specs).map((r) => r.label);
  // t1@1 has label "First" for both (same), t1@2 has "A" vs "B" (distinguishing)
  // t1@2 is secondary since it only appears when there are 2 occurrences
  expect(labels).toEqual(["A", "B"]);
});

// --- spec without Annotation.Label (only Trace) ---

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
  const labels = deriveLabels(specs).map((r) => r.label);
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
  const labels = deriveLabels(specs, { includeNativeLabel: true }).map((r) => r.label);
  expect(labels).toEqual(["X", "Y"]);
});
