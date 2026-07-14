import { Annotation, createGlobalPObjectId, createPlRef } from "@milaboratories/pl-model-common";
import type {
  AxisSpec,
  PColumn,
  PColumnSpec,
  PlRef,
  PObjectId,
} from "@milaboratories/pl-model-common";
import canonicalize from "canonicalize";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { PColumnDataUniversal } from "../../render/internal";
import { buildRefMap, filterMatchesToOptions, findFilterColumns } from "./filter_discovery";
import {
  createTestCollectionDriver,
  type TestCollectionDriverHandle,
} from "../../columns/__test_helpers__/collection_driver";

let driverHandle: TestCollectionDriverHandle;

beforeEach(() => {
  driverHandle = createTestCollectionDriver();
  driverHandle.installAmbientCtx();
});

afterEach(async () => {
  driverHandle.uninstallAmbientCtx();
  await driverHandle.dispose();
});

function registerCols(cols: PColumn<PColumnDataUniversal | undefined>[]): void {
  driverHandle.register(cols.map((c) => ({ id: c.id, spec: c.spec })));
}

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

function col(id: PObjectId, s: PColumnSpec): PColumn<PColumnDataUniversal | undefined> {
  return {
    id,
    spec: s,
    data: {} as never,
  };
}

/** Canonical global PObjectId — required so downstream `extractPObjectId` accepts it. */
function gid(name: string): PObjectId {
  return createGlobalPObjectId("test-block", name);
}

// anchor defines the key space: [sample, gene]
const anchorAxes = [axis("sample"), axis("gene")];
const anchorSpec = spec("anchor", anchorAxes);
const anchorSnap = col(gid("anchor"), anchorSpec);

describe("findFilterColumns", () => {
  test("returns columns with pl7.app/isSubset annotation", () => {
    const filter = col(
      gid("f1"),
      spec("filter1", [axis("sample")], { [Annotation.IsSubset]: "true" }),
    );
    const regular = col(gid("r1"), spec("regular1", [axis("sample")]));
    registerCols([filter, regular, anchorSnap]);

    const results = findFilterColumns({
      sources: [{ columns: [filter, regular, anchorSnap], isFinal: true }],
      anchorSpec,
      driver: driverHandle.driver,
    });
    expect(results.every((m) => m.getSpec().name !== "regular1")).toBe(true);
    expect(results.some((m) => m.getSpec().name === "filter1")).toBe(true);
  });

  test("axes subset: excludes filter whose axes are not a subset of anchor axes", () => {
    // filter with axis "other" — not a subset of anchor axes [sample, gene]
    const badFilter = col(
      gid("f2"),
      spec("bad-filter", [axis("other")], { [Annotation.IsSubset]: "true" }),
    );
    registerCols([badFilter, anchorSnap]);

    const results = findFilterColumns({
      sources: [{ columns: [badFilter, anchorSnap], isFinal: true }],
      anchorSpec,
      driver: driverHandle.driver,
    });
    expect(results.every((m) => m.getSpec().name !== "bad-filter")).toBe(true);
  });

  test("empty result when no filters exist", () => {
    const regular = col(gid("r1"), spec("regular1", [axis("sample")]));
    registerCols([regular, anchorSnap]);

    const results = findFilterColumns({
      sources: [{ columns: [regular, anchorSnap], isFinal: true }],
      anchorSpec,
      driver: driverHandle.driver,
    });
    expect(results).toHaveLength(0);
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

    // Build ref map from entries (simulating result pool)
    const refMap = buildRefMap([
      { ref: anchorSnap.id as unknown as PlRef },
      { ref: filterRef1 },
      { ref: filterRef2 },
    ]);

    const filterSpec1 = spec("filter1", [axis("sample")], { [Annotation.IsSubset]: "true" });
    const filterSpec2 = spec("filter2", [axis("sample")], { [Annotation.IsSubset]: "true" });

    const f1Snap = col(canonicalize(filterRef1)! as PObjectId, filterSpec1);
    const f2Snap = col(canonicalize(filterRef2)! as PObjectId, filterSpec2);
    registerCols([f1Snap, f2Snap, anchorSnap]);

    const matches = findFilterColumns({
      sources: [{ columns: [f1Snap, f2Snap, anchorSnap], isFinal: true }],
      anchorSpec,
      driver: driverHandle.driver,
    });
    expect(matches.length).toBe(2);

    const options = filterMatchesToOptions(matches, {
      refsByObjectId: refMap,
      datasetSpec: anchorSpec,
    });
    expect(options).toHaveLength(2);
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
    const fSnap = col(canonicalize(filterRef)! as PObjectId, filterSpec);
    const dsSnap = col(gid("dataset"), datasetSpec);
    registerCols([fSnap, dsSnap]);

    const matches = findFilterColumns({
      sources: [{ columns: [fSnap, dsSnap], isFinal: true }],
      anchorSpec: datasetSpec,
      driver: driverHandle.driver,
    });
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
    const f1Snap = col(canonicalize(ref1)! as PObjectId, filterSpec1);
    const f2Snap = col(canonicalize(ref2)! as PObjectId, filterSpec2);
    const dsSnap = col(gid("dataset"), datasetSpec);
    registerCols([f1Snap, f2Snap, dsSnap]);

    const matches = findFilterColumns({
      sources: [{ columns: [f1Snap, f2Snap, dsSnap], isFinal: true }],
      anchorSpec: datasetSpec,
      driver: driverHandle.driver,
    });
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
    const knownSnap = col(canonicalize(knownRef)! as PObjectId, knownSpec);
    const orphanSnap = col(gid("orphan"), orphanSpec);
    registerCols([knownSnap, orphanSnap, anchorSnap]);

    const matches = findFilterColumns({
      sources: [{ columns: [knownSnap, orphanSnap, anchorSnap], isFinal: true }],
      anchorSpec,
      driver: driverHandle.driver,
    });
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
