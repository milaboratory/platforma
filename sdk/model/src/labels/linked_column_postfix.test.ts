import { Annotation, type AxisSpec, type PColumnSpec } from "@milaboratories/pl-model-common";
import { describe, expect, test } from "vitest";
import { derivePostfixes } from "./linked_column_postfix";

// Shared target axis: it's on the hit column, and every linker's hit-facing side carries it — this
// is what lets `extractRoots` tell the source side (the "рут") from the target side.
const TARGET: AxisSpec = { type: "String", name: "hitAxis" };

const hit: PColumnSpec = {
  kind: "PColumn",
  name: "counts",
  valueType: "Int",
  axesSpec: [TARGET],
  annotations: { [Annotation.Label]: "Counts" },
} as PColumnSpec;

/** A source-side axis, lives INSIDE a linker's axesSpec (never standalone). */
function sourceAxis(name: string, label?: string, domain?: Record<string, string>): AxisSpec {
  return {
    type: "String",
    name,
    ...(domain ? { domain } : {}),
    ...(label ? { annotations: { [Annotation.Label]: label } } : {}),
  } as AxisSpec;
}

/** Linker column: bridges a source axis → the shared target axis; carries a LinkLabel. */
function linker(linkLabel: string, src: AxisSpec, name = linkLabel): PColumnSpec {
  return {
    kind: "PColumn",
    name,
    valueType: "Int",
    axesSpec: [src, TARGET],
    annotations: { [Annotation.LinkLabel]: linkLabel },
  } as PColumnSpec;
}

describe("prototype — structural postfix (difference of sources)", () => {
  const axSample = sourceAxis("sampleId", "Sample");
  const axClone = sourceAxis("cloneId", "Clone");

  test("case 1 — same linker (label), different roots → postfix = root", () => {
    const labels = derivePostfixes([
      { stem: "Counts", hit, linkers: [linker("MapperA", axSample)] },
      { stem: "Counts", hit, linkers: [linker("MapperA", axClone)] },
    ]);
    expect(labels).toEqual(["Counts via Sample", "Counts via Clone"]);
  });

  test("case 2 — different linkers, same root → postfix = linker", () => {
    const labels = derivePostfixes([
      { stem: "Counts", hit, linkers: [linker("MapperA", axSample)] },
      { stem: "Counts", hit, linkers: [linker("MapperB", axSample)] },
    ]);
    expect(labels).toEqual(["Counts via MapperA", "Counts via MapperB"]);
  });

  test("case 3 — different linkers, different roots → root suffices (linker not added)", () => {
    const labels = derivePostfixes([
      { stem: "Counts", hit, linkers: [linker("MapperA", axSample)] },
      { stem: "Counts", hit, linkers: [linker("MapperB", axClone)] },
    ]);
    expect(labels).toEqual(["Counts via Sample", "Counts via Clone"]);
  });

  test("roots share a Label but differ by domain → render only the differing domain key", () => {
    const donorA = sourceAxis("donor", "Donor", { batch: "A" });
    const donorB = sourceAxis("donor", "Donor", { batch: "B" });
    const labels = derivePostfixes([
      { stem: "Counts", hit, linkers: [linker("MapperA", donorA)] },
      { stem: "Counts", hit, linkers: [linker("MapperA", donorB)] },
    ]);
    expect(labels).toEqual(["Counts via Donor[batch=A]", "Counts via Donor[batch=B]"]);
  });

  test("no collision → no postfix", () => {
    const labels = derivePostfixes([
      { stem: "Read counts" },
      { stem: "Coverage", hit, linkers: [linker("MapperA", axSample)] },
    ]);
    expect(labels).toEqual(["Read counts", "Coverage"]);
  });

  test("collision only on a subset → bare row stays bare (direct column has no path)", () => {
    const labels = derivePostfixes([
      { stem: "Counts" }, // direct column, no path
      { stem: "Counts", hit, linkers: [linker("MapperA", axSample)] },
    ]);
    expect(labels).toEqual(["Counts", "Counts via Sample"]);
  });

  test("mixed group — root+linker both needed globally; symmetric render, all unique", () => {
    // A: MapperA+Sample, B: MapperA+Clone, C: MapperB+Clone
    // root separates A from {B,C}; B vs C share root(Clone) → linker needed too.
    const labels = derivePostfixes([
      { stem: "Counts", hit, linkers: [linker("MapperA", axSample)] },
      { stem: "Counts", hit, linkers: [linker("MapperA", axClone)] },
      { stem: "Counts", hit, linkers: [linker("MapperB", axClone)] },
    ]);
    expect(labels).toEqual([
      "Counts via Sample MapperA",
      "Counts via Clone MapperA",
      "Counts via Clone MapperB",
    ]);
  });

  // Refinement (deferred): per-row minimal trim — row A only needs the root, so its ideal label is
  // "Counts via Sample" without the redundant "MapperA". Requires an occurrence-count pass.
  test.todo(
    "per-row minimal trim: A should drop the non-load-bearing linker → 'Counts via Sample'",
  );
});

describe("opted-in linkers (Annotation.Linker.AlwaysLabel)", () => {
  const axSample = sourceAxis("sampleId", "Sample");
  const axClone = sourceAxis("cloneId", "Clone");
  const axAnchor = sourceAxis("anchorId", "Anchor clone");

  function optedIn(linkLabel: string, src: AxisSpec): PColumnSpec {
    const l = linker(linkLabel, src);
    return { ...l, annotations: { ...l.annotations, [Annotation.Linker.AlwaysLabel]: "true" } };
  }

  test("opted-in linker names a column whose stem is unique", () => {
    const labels = derivePostfixes([
      { stem: "Read counts" },
      { stem: "IC50", hit, linkers: [optedIn("Nearest Anchor", axAnchor)] },
    ]);
    expect(labels).toEqual(["Read counts", "IC50 via Nearest Anchor"]);
  });

  test("plain linker leaves a unique column unnamed", () => {
    const labels = derivePostfixes([{ stem: "IC50", hit, linkers: [linker("Mapper", axAnchor)] }]);
    expect(labels).toEqual(["IC50"]);
  });

  test("mixed chain, unique stem: only the opted-in step is named", () => {
    const labels = derivePostfixes([
      {
        stem: "IC50",
        hit,
        linkers: [linker("Clone to lineage", axClone), optedIn("Nearest Anchor", axAnchor)],
      },
    ]);
    expect(labels).toEqual(["IC50 via Nearest Anchor"]);
  });

  test("mixed chains colliding: collision handling adds the plain step", () => {
    const labels = derivePostfixes([
      { stem: "IC50", hit, linkers: [linker("MapperA", axClone), optedIn("Anchor", axAnchor)] },
      { stem: "IC50", hit, linkers: [linker("MapperB", axClone), optedIn("Anchor", axAnchor)] },
    ]);
    expect(labels).toEqual(["IC50 via MapperA > Anchor", "IC50 via MapperB > Anchor"]);
  });

  test("collision with a direct column: the opted-in step alone distinguishes", () => {
    const labels = derivePostfixes([
      { stem: "Counts" },
      { stem: "Counts", hit, linkers: [optedIn("Anchor", axSample)] },
    ]);
    expect(labels).toEqual(["Counts", "Counts via Anchor"]);
  });

  test("same opted-in linker label, different roots: root is added as before", () => {
    const labels = derivePostfixes([
      { stem: "Counts", hit, linkers: [optedIn("Anchor", axSample)] },
      { stem: "Counts", hit, linkers: [optedIn("Anchor", axClone)] },
    ]);
    expect(labels).toEqual(["Counts via Sample Anchor", "Counts via Clone Anchor"]);
  });

  test("custom formatter renders the forced postfix", () => {
    const labels = derivePostfixes(
      [{ stem: "IC50", hit, linkers: [optedIn("Nearest Anchor", axAnchor)] }],
      ({ linkers }) => `(from ${linkers.map((l) => l.text).join(", ")})`,
    );
    expect(labels).toEqual(["IC50 (from Nearest Anchor)"]);
  });

  test("mixed group, same root: plain row keeps its label, opted-in row names its step", () => {
    const rows = (anchor: PColumnSpec) => [
      { stem: "X", hit, linkers: [anchor] },
      { stem: "X", hit, linkers: [linker("Cluster", axClone)] },
      { stem: "X" },
    ];
    expect(derivePostfixes(rows(linker("Anchor", axClone)))).toEqual([
      "X via Anchor",
      "X via Cluster",
      "X",
    ]);
    expect(derivePostfixes(rows(optedIn("Anchor", axClone)))).toEqual([
      "X via Anchor",
      "X via Cluster",
      "X",
    ]);
  });

  test("mixed group, different roots: plain row keeps its root-only label", () => {
    const rows = (anchor: PColumnSpec) => [
      { stem: "X", hit, linkers: [anchor] },
      { stem: "X", hit, linkers: [linker("Cluster", axSample)] },
      { stem: "X" },
    ];
    expect(derivePostfixes(rows(linker("Anchor", axClone)))).toEqual([
      "X via Clone",
      "X via Sample",
      "X",
    ]);
    expect(derivePostfixes(rows(optedIn("Anchor", axClone)))).toEqual([
      "X via Clone Anchor",
      "X via Sample",
      "X",
    ]);
  });

  test("forced step beside a root reproducing another root: the common linker step splits them", () => {
    const anchor = (src: AxisSpec) => linker("Anchor", src);
    const labels = derivePostfixes([
      { stem: "Counts", hit, linkers: [anchor(axSample)] },
      { stem: "Counts", hit, linkers: [anchor(sourceAxis("anchorCloneId", "Clone Anchor"))] },
      { stem: "Counts", hit, linkers: [optedIn("Anchor", axClone)] },
    ]);
    expect(new Set(labels).size).toBe(3);
  });

  test("forced postfix repeating another stem's label: the root is added", () => {
    const labels = derivePostfixes([
      { stem: "Counts", hit, linkers: [optedIn("Anchor", axSample)] },
      { stem: "Counts via Anchor" },
    ]);
    expect(labels).toEqual(["Counts via Sample Anchor", "Counts via Anchor"]);
  });

  test("unlabelled opted-in linker adds nothing", () => {
    const unlabelled: PColumnSpec = {
      kind: "PColumn",
      name: "anchorLinker",
      valueType: "Int",
      axesSpec: [axAnchor, TARGET],
      annotations: { [Annotation.Linker.AlwaysLabel]: "true" },
    };
    expect(derivePostfixes([{ stem: "IC50", hit, linkers: [unlabelled] }])).toEqual(["IC50"]);
  });

  test.each([["false"], ["True"], [undefined]])("annotation value %s does not opt in", (value) => {
    const l = linker("Nearest Anchor", axAnchor);
    const annotated: PColumnSpec = {
      ...l,
      annotations: {
        ...l.annotations,
        ...(value === undefined ? {} : { [Annotation.Linker.AlwaysLabel]: value }),
      },
    };
    expect(derivePostfixes([{ stem: "IC50", hit, linkers: [annotated] }])).toEqual(["IC50"]);
  });
});
