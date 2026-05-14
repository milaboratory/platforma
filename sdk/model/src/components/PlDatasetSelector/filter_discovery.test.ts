import { Annotation, createPlRef } from "@milaboratories/pl-model-common";
import type { AxisSpec, PColumnSpec, PObjectId } from "@milaboratories/pl-model-common";
import { SpecDriver } from "@milaboratories/pf-spec-driver";
import canonicalize from "canonicalize";
import { afterEach, describe, expect, test } from "vitest";
import type { ColumnSnapshot } from "../../columns/column_snapshot";
import { ColumnCollectionBuilder } from "../../columns/column_collection_builder";
import { buildRefMap, filterMatchesToOptions, findFilterColumns } from "./filter_discovery";

const drivers: SpecDriver[] = [];

function createSpecFrameCtx() {
  const driver = new SpecDriver();
  drivers.push(driver);
  return driver;
}

afterEach(async () => {
  for (const driver of drivers) await driver.dispose();
  drivers.length = 0;
});

function axis(name: string): AxisSpec {
  return { name, type: "String" } as AxisSpec;
}

function spec(
  name: string,
  axesSpec: AxisSpec[],
  annotations: Record<string, string> = {},
): PColumnSpec {
  return { kind: "PColumn", name, valueType: "Int", axesSpec, annotations } as PColumnSpec;
}

function snap(id: string, s: PColumnSpec): ColumnSnapshot<PObjectId> {
  return { id: id as PObjectId, spec: s, dataStatus: "ready", data: { get: () => ({}) as never } };
}

// anchor defines the key space: [sample, gene]
const anchorAxes = [axis("sample"), axis("gene")];
const anchorSpec = spec("anchor", anchorAxes);
const anchorSnap = snap("anchor-id", anchorSpec);

describe("findFilterColumns", () => {
  test("returns columns with pl7.app/isSubset annotation", () => {
    const filter = snap("f1", spec("filter1", [axis("sample")], { [Annotation.IsSubset]: "true" }));
    const regular = snap("r1", spec("regular1", [axis("sample")]));

    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([filter, regular, anchorSnap]);
    const collection = builder.build({ anchors: { main: anchorSpec } })!;

    const results = findFilterColumns(collection);
    expect(results.every((m) => m.column.spec.name !== "regular1")).toBe(true);
    expect(results.some((m) => m.column.spec.name === "filter1")).toBe(true);
  });

  test("axes subset: excludes filter whose axes are not a subset of anchor axes", () => {
    // filter with axis "other" — not a subset of anchor axes [sample, gene]
    const badFilter = snap(
      "f2",
      spec("bad-filter", [axis("other")], { [Annotation.IsSubset]: "true" }),
    );

    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([badFilter, anchorSnap]);
    const collection = builder.build({ anchors: { main: anchorSpec } })!;

    const results = findFilterColumns(collection);
    expect(results.every((m) => m.column.spec.name !== "bad-filter")).toBe(true);
  });

  test("empty result when no filters exist", () => {
    const regular = snap("r1", spec("regular1", [axis("sample")]));

    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([regular, anchorSnap]);
    const collection = builder.build({ anchors: { main: anchorSpec } })!;

    expect(findFilterColumns(collection)).toHaveLength(0);
  });
});

describe("buildRefMap", () => {
  test("maps canonicalized PlRef to original ref", () => {
    const ref1 = createPlRef("b1", "out1");
    const ref2 = createPlRef("b2", "out2", true);
    const map = buildRefMap([{ ref: ref1 }, { ref: ref2 }]);
    expect(map.get(canonicalize(ref1)! as PObjectId)).toBe(ref1);
    expect(map.get(canonicalize(ref2)! as PObjectId)).toBe(ref2);
    expect(map.size).toBe(2);
  });

  test("returns empty map for empty entries", () => {
    expect(buildRefMap([]).size).toBe(0);
  });
});

describe("filterMatchesToOptions", () => {
  test("converts filter matches to Option[] with derived labels", () => {
    const filterRef1 = createPlRef("b1", "filter-top1000");
    const filterRef2 = createPlRef("b1", "filter-highconf");

    const refMap = buildRefMap([{ ref: filterRef1 }, { ref: filterRef2 }]);
    const filterSpec1 = spec("filter1", [axis("sample")], { [Annotation.IsSubset]: "true" });
    const filterSpec2 = spec("filter2", [axis("sample")], { [Annotation.IsSubset]: "true" });

    const f1Snap = snap(canonicalize(filterRef1)! as string, filterSpec1);
    const f2Snap = snap(canonicalize(filterRef2)! as string, filterSpec2);

    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([f1Snap, f2Snap, anchorSnap]);
    const collection = builder.build({ anchors: { main: anchorSpec } })!;

    const matches = findFilterColumns(collection);
    expect(matches.length).toBe(2);

    const options = filterMatchesToOptions(matches, {
      refsByObjectId: refMap,
      datasetSpec: anchorSpec,
    });
    expect(options).toHaveLength(2);
    // Each option has a ref and label
    for (const opt of options) {
      expect(opt.ref).toBeDefined();
      expect(opt.label).toBeDefined();
      expect(typeof opt.label).toBe("string");
    }
  });

  test("single filter: dataset name prefixes the discriminating trace step", () => {
    // Regression: without the dataset in the input, deriveDistinctLabels
    // picks the highest-importance step it sees — the dataset's own
    // `samples-and-data/dataset` step (importance 100) — and the filter
    // shows "Bulk" instead of "Top 10". Appending the dataset forces the
    // algorithm to include the lower-importance lead-selection step too.
    const datasetSpec = spec("dataset", [axis("sample"), axis("gene")], {
      [Annotation.Label]: "Bulk",
      [Annotation.Trace]: JSON.stringify([
        { type: "milaboratories.samples-and-data/dataset", label: "Bulk", importance: 100 },
        { type: "milaboratories.mixcr-clonotyping", label: "MiXCR", importance: 20 },
      ]),
    });

    const filterRef = createPlRef("b1", "filter");
    const refMap = buildRefMap([{ ref: filterRef }]);
    const filterSpec = spec("filter", [axis("sample")], {
      [Annotation.IsSubset]: "true",
      [Annotation.Label]: "Selected Leads",
      [Annotation.Trace]: JSON.stringify([
        { type: "milaboratories.samples-and-data/dataset", label: "Bulk", importance: 100 },
        { type: "milaboratories.mixcr-clonotyping", label: "MiXCR", importance: 20 },
        { type: "milaboratories.antibody-tcr-lead-selection", label: "Top 10", importance: 30 },
      ]),
    });
    const fSnap = snap(canonicalize(filterRef)! as string, filterSpec);

    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([fSnap, anchorSnap]);
    const collection = builder.build({ anchors: { main: anchorSpec } })!;

    const matches = findFilterColumns(collection);
    expect(matches).toHaveLength(1);

    const options = filterMatchesToOptions(matches, { refsByObjectId: refMap, datasetSpec });
    expect(options).toHaveLength(1);
    expect(options[0].label).toBe("Bulk / Top 10");

    // Caller's `formatters.native` must NOT override the internal
    // suppression — otherwise the algorithm short-circuits on the
    // inherited "Selected Leads" label.
    const withCustomNative = filterMatchesToOptions(matches, {
      refsByObjectId: refMap,
      datasetSpec,
      labelOptions: { formatters: { native: (l) => `<<${l}>>` } },
    });
    expect(withCustomNative[0].label).toBe("Bulk / Top 10");

    // Non-native label options (here `separator`) flow through.
    const withSeparator = filterMatchesToOptions(matches, {
      refsByObjectId: refMap,
      datasetSpec,
      labelOptions: { separator: " :: " },
    });
    expect(withSeparator[0].label).toBe("Bulk :: Top 10");
  });

  test("multiple filters with shared dataset trace disambiguate by filter-specific steps", () => {
    const datasetSpec = spec("dataset", [axis("sample"), axis("gene")], {
      [Annotation.Label]: "Bulk",
      [Annotation.Trace]: JSON.stringify([
        { type: "milaboratories.samples-and-data/dataset", label: "Bulk", importance: 100 },
        { type: "milaboratories.mixcr-clonotyping", label: "MiXCR", importance: 20 },
      ]),
    });

    const ref1 = createPlRef("b1", "f1");
    const ref2 = createPlRef("b2", "f2");
    const refMap = buildRefMap([{ ref: ref1 }, { ref: ref2 }]);
    const filterSpec1 = spec("filter1", [axis("sample")], {
      [Annotation.IsSubset]: "true",
      [Annotation.Label]: "Selected Leads",
      [Annotation.Trace]: JSON.stringify([
        { type: "milaboratories.samples-and-data/dataset", label: "Bulk", importance: 100 },
        { type: "milaboratories.mixcr-clonotyping", label: "MiXCR", importance: 20 },
        { type: "milaboratories.antibody-tcr-lead-selection", label: "Top 10", importance: 30 },
      ]),
    });
    const filterSpec2 = spec("filter2", [axis("sample")], {
      [Annotation.IsSubset]: "true",
      [Annotation.Label]: "Selected Leads",
      [Annotation.Trace]: JSON.stringify([
        { type: "milaboratories.samples-and-data/dataset", label: "Bulk", importance: 100 },
        { type: "milaboratories.mixcr-clonotyping", label: "MiXCR", importance: 20 },
        { type: "milaboratories.antibody-tcr-lead-selection", label: "Top 11", importance: 30 },
      ]),
    });
    const f1Snap = snap(canonicalize(ref1)! as string, filterSpec1);
    const f2Snap = snap(canonicalize(ref2)! as string, filterSpec2);

    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([f1Snap, f2Snap, anchorSnap]);
    const collection = builder.build({ anchors: { main: anchorSpec } })!;

    const matches = findFilterColumns(collection);
    expect(matches).toHaveLength(2);

    const options = filterMatchesToOptions(matches, { refsByObjectId: refMap, datasetSpec });
    expect(options.map((o) => o.label).sort()).toEqual(["Bulk / Top 10", "Bulk / Top 11"]);
  });

  test("returns empty array for empty matches", () => {
    expect(
      filterMatchesToOptions([], { refsByObjectId: new Map(), datasetSpec: anchorSpec }),
    ).toEqual([]);
  });

  test("skips entries whose id is not in refsByObjectId", () => {
    const knownRef = createPlRef("b1", "known");
    const knownSpec = spec("known", [axis("sample")], { [Annotation.IsSubset]: "true" });
    const orphanSpec = spec("orphan", [axis("sample")], { [Annotation.IsSubset]: "true" });
    const knownSnap = snap(canonicalize(knownRef)! as string, knownSpec);
    const orphanSnap = snap("orphan-id", orphanSpec);

    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([knownSnap, orphanSnap, anchorSnap]);
    const collection = builder.build({ anchors: { main: anchorSpec } })!;

    const matches = findFilterColumns(collection);
    expect(matches.length).toBe(2);
    const refMap = buildRefMap([{ ref: knownRef }]);
    const options = filterMatchesToOptions(matches, {
      refsByObjectId: refMap,
      datasetSpec: anchorSpec,
    });
    expect(options).toHaveLength(1);
    expect(options[0].ref).toBe(knownRef);
  });
});
