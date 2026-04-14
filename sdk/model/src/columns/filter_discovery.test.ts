import { Annotation } from "@milaboratories/pl-model-common";
import type { AxisSpec, PColumnSpec, PObjectId } from "@milaboratories/pl-model-common";
import { SpecDriver } from "@milaboratories/pf-spec-driver";
import { afterEach, describe, expect, test } from "vitest";
import type { ColumnSnapshot } from "./column_snapshot";
import { ColumnCollectionBuilder } from "./column_collection_builder";
import { findFilterColumns } from "./filter_discovery";

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
