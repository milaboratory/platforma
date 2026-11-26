import {
  Annotation,
  createColumnDiscoveredId,
  createGlobalPObjectId,
  createPlRef,
  isPColumnSpec,
} from "@milaboratories/pl-model-common";
import type { AxisSpec, PColumnSpec, PObjectSpec } from "@milaboratories/pl-model-common";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { BlockRenderCtx } from "../../render";
import { buildDatasetOptions } from "./build_dataset_options";
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

const sampleAxis: AxisSpec = { name: "sample", type: "String" };
const geneAxis: AxisSpec = { name: "gene", type: "String" };
const pathwayAxis: AxisSpec = { name: "pathway", type: "String" };

function spec(
  name: string,
  axesSpec: AxisSpec[],
  annotations: Record<string, string> = {},
): PColumnSpec {
  return { kind: "PColumn", name, valueType: "Int", axesSpec, annotations };
}

/** Registers the columns as outputs of the block, named as their specs are. */
function registerOutputs(blockId: string, specs: PColumnSpec[]): void {
  driverHandle.register(
    specs.map((s) => ({ id: createGlobalPObjectId(blockId, s.name), spec: s })),
  );
}

const isDataset = (s: PObjectSpec): boolean => s.name === "abundance";

const abundance = spec("abundance", [sampleAxis, geneAxis], { [Annotation.Label]: "Abundance" });
const other = spec("other", [sampleAxis, geneAxis], { [Annotation.Label]: "Other" });
const subset = spec("subset", [geneAxis], { [Annotation.IsSubset]: "true" });
const sampleSubset = spec("sampleSubset", [sampleAxis], { [Annotation.IsSubset]: "true" });
const foreignSubset = spec("foreignSubset", [pathwayAxis], { [Annotation.IsSubset]: "true" });

describe("buildDatasetOptions", () => {
  test("offers the result pool columns the predicate accepts", () => {
    registerOutputs("b1", [abundance, other]);

    const options = buildDatasetOptions(new BlockRenderCtx(), { primary: isDataset });

    expect(options).toEqual([
      { primary: { ref: createPlRef("b1", "abundance", true), label: "Abundance" } },
    ]);
  });

  test("offers every result pool column without a primary option", () => {
    registerOutputs("b1", [abundance, other]);

    const options = buildDatasetOptions(new BlockRenderCtx()) ?? [];

    expect(options.map((o) => o.primary.label).sort()).toEqual(["Abundance", "Other"]);
  });

  test("a selector offers the same datasets as the predicate that says the same", () => {
    registerOutputs("b1", [abundance, other, subset]);
    const ctx = new BlockRenderCtx();

    const bySelector = buildDatasetOptions(ctx, {
      primary: { name: [{ type: "exact", value: "abundance" }] },
    });
    const byAxis = buildDatasetOptions(ctx, {
      primary: { axes: [{ name: [{ type: "exact", value: "sample" }] }] },
      filter: () => false,
    });

    expect(bySelector).toEqual(buildDatasetOptions(ctx, { primary: isDataset }));
    expect(byAxis).toEqual(
      buildDatasetOptions(ctx, {
        primary: (s) => isPColumnSpec(s) && s.axesSpec.some((a) => a.name === "sample"),
        filter: () => false,
      }),
    );
    expect(byAxis).toHaveLength(2);
  });

  test("returns no options when nothing qualifies", () => {
    registerOutputs("b1", [other]);

    expect(buildDatasetOptions(new BlockRenderCtx(), { primary: isDataset })).toEqual([]);
  });

  test("leaves requireEnrichments off the dataset refs when asked", () => {
    registerOutputs("b1", [abundance]);

    const options = buildDatasetOptions(new BlockRenderCtx(), {
      primary: isDataset,
      requireEnrichments: false,
    });

    expect(options?.map((o) => o.primary.ref)).toEqual([createPlRef("b1", "abundance")]);
  });

  test("gives same-named datasets of different blocks distinct labels", () => {
    const traced = (label: string): PColumnSpec => ({
      ...abundance,
      domain: { "pl7.app/blockId": label },
      annotations: {
        ...abundance.annotations,
        [Annotation.Trace]: JSON.stringify([{ type: "import", label, importance: 10 }]),
      },
    });
    registerOutputs("b1", [traced("First")]);
    registerOutputs("b2", [traced("Second")]);

    const options = buildDatasetOptions(new BlockRenderCtx(), { primary: isDataset }) ?? [];

    expect(options.map((o) => o.primary.ref)).toEqual([
      createPlRef("b1", "abundance", true),
      createPlRef("b2", "abundance", true),
    ]);
    expect(new Set(options.map((o) => o.primary.label)).size).toBe(2);
  });

  test("attaches the subsets on the dataset's axes as filters", () => {
    registerOutputs("b1", [abundance]);
    registerOutputs("b2", [subset, sampleSubset, foreignSubset]);

    const options = buildDatasetOptions(new BlockRenderCtx(), { primary: isDataset }) ?? [];

    expect(options).toHaveLength(1);
    expect(options[0].filters?.map((f) => f.ref)).toEqual(
      expect.arrayContaining([createPlRef("b2", "subset"), createPlRef("b2", "sampleSubset")]),
    );
    expect(options[0].filters).toHaveLength(2);
  });

  test("the filter option restricts the attached subsets", () => {
    registerOutputs("b1", [abundance]);
    registerOutputs("b2", [subset, sampleSubset]);
    const ctx = new BlockRenderCtx();

    const byPredicate = buildDatasetOptions(ctx, {
      primary: isDataset,
      filter: (s) => s.name === "subset",
    });
    const bySelector = buildDatasetOptions(ctx, {
      primary: isDataset,
      filter: { name: [{ type: "exact", value: "subset" }] },
    });
    const none = buildDatasetOptions(ctx, { primary: isDataset, filter: () => false });

    expect(byPredicate?.[0].filters?.map((f) => f.ref)).toEqual([createPlRef("b2", "subset")]);
    expect(bySelector).toEqual(byPredicate);
    expect(none).toEqual([
      { primary: { ref: createPlRef("b1", "abundance", true), label: "Abundance" } },
    ]);
  });

  test("attaches the columns reached through a linker as enrichments", () => {
    const linker = spec("pathwayToGene", [pathwayAxis, geneAxis], {
      [Annotation.IsLinkerColumn]: "true",
    });
    const pathwayScore = spec("pathwayScore", [pathwayAxis], { [Annotation.Label]: "Score" });
    registerOutputs("b1", [abundance]);
    registerOutputs("b2", [linker, pathwayScore]);
    const ctx = new BlockRenderCtx();

    const without = buildDatasetOptions(ctx, { primary: isDataset }) ?? [];
    const withAll = buildDatasetOptions(ctx, { primary: isDataset, withEnrichments: () => true });
    const withNone = buildDatasetOptions(ctx, { primary: isDataset, withEnrichments: () => false });

    expect(without[0].enrichments).toBeUndefined();
    expect(withNone).toEqual(without);
    expect(withAll?.[0].enrichments).toEqual([
      {
        id: createColumnDiscoveredId({
          column: createGlobalPObjectId("b2", "pathwayScore"),
          path: [{ type: "linker", column: createGlobalPObjectId("b2", "pathwayToGene") }],
        }),
        label: expect.any(String),
      },
    ]);
  });
});
