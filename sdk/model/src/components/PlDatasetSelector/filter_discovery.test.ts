import { Annotation, createPlRef } from "@milaboratories/pl-model-common";
import type { AxisSpec, PColumnSpec, PlRef, PObjectId } from "@milaboratories/pl-model-common";
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
    const entries = [{ ref: ref1 }, { ref: ref2 }];

    const map = buildRefMap(entries);

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
      { ref: anchorSnap.id as unknown as PlRef }, // anchor — won't be looked up
      { ref: filterRef1 },
      { ref: filterRef2 },
    ]);

    // Build filter specs with isSubset annotation
    const filterSpec1 = spec("filter1", [axis("sample")], { [Annotation.IsSubset]: "true" });
    const filterSpec2 = spec("filter2", [axis("sample")], { [Annotation.IsSubset]: "true" });

    // Use the canonical PlRef as the PObjectId (matches how result pool works)
    const f1Snap = snap(canonicalize(filterRef1)! as string, filterSpec1);
    const f2Snap = snap(canonicalize(filterRef2)! as string, filterSpec2);

    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([f1Snap, f2Snap, anchorSnap]);
    const collection = builder.build({ anchors: { main: anchorSpec } })!;

    const matches = findFilterColumns(collection);
    expect(matches.length).toBe(2);

    const options = filterMatchesToOptions(matches, refMap);
    expect(options).toHaveLength(2);
    // Each option has a ref and label
    for (const opt of options) {
      expect(opt.ref).toBeDefined();
      expect(opt.label).toBeDefined();
      expect(typeof opt.label).toBe("string");
    }
  });

  test("returns empty array for empty matches", () => {
    expect(filterMatchesToOptions([], new Map())).toEqual([]);
  });

  test("throws when ref not found in map", () => {
    const filterSpec1 = spec("orphan", [axis("sample")], { [Annotation.IsSubset]: "true" });
    const f1Snap = snap("orphan-id", filterSpec1);

    const builder = new ColumnCollectionBuilder(createSpecFrameCtx());
    builder.addSource([f1Snap, anchorSnap]);
    const collection = builder.build({ anchors: { main: anchorSpec } })!;

    const matches = findFilterColumns(collection);
    expect(matches.length).toBe(1);

    expect(() => filterMatchesToOptions(matches, new Map())).toThrow(/no PlRef found/);
  });
});
