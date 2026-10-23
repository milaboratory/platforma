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
