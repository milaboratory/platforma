import type { AxisSpec, PColumnSpec } from "@milaboratories/pl-model-common";
import { describe, expect, test } from "vitest";
import { SpecDriver } from "./spec_driver";

function createSpec(
  name: string,
  axesSpec?: AxisSpec[],
  extra?: Partial<PColumnSpec>,
): PColumnSpec {
  return {
    kind: "PColumn",
    name,
    valueType: "Int",
    axesSpec: axesSpec ?? [{ name: "id", type: "String" } as AxisSpec],
    annotations: {},
    ...extra,
  } as PColumnSpec;
}

describe("SpecDriver", () => {
  test("discoverColumns returns all columns with no filters", async () => {
    await using driver = new SpecDriver();
    const { key: handle } = driver.createSpecFrame({
      col1: createSpec("col1"),
      col2: createSpec("col2"),
    });

    const response = driver.discoverColumns(handle, {
      axes: [],
      maxHops: 0,
      constraints: {
        allowFloatingSourceAxes: true,
        allowFloatingHitAxes: true,
        allowSourceQualifications: false,
        allowHitQualifications: false,
      },
    });

    expect(response.hits).toHaveLength(2);
    const names = response.hits.map((h) => h.hit.spec.name).sort();
    expect(names).toEqual(["col1", "col2"]);
  });

  test("createSpecFrame converts pl7.app/parents annotation to numeric parentAxes", async () => {
    await using driver = new SpecDriver();
    const linkerAxes: AxisSpec[] = [
      { name: "pl7.app/sampleId", type: "String" },
      {
        name: "pl7.app/sc/cellId",
        type: "String",
        annotations: {
          "pl7.app/parents": '["pl7.app/sampleId"]',
          "pl7.app/label": "Cell ID",
        },
      },
      { name: "pl7.app/vdj/scClonotypeKey", type: "String" },
    ];
    const linkerSpec = createSpec("pl7.app/sc/cellLinker", linkerAxes, {
      annotations: { "pl7.app/isLinkerColumn": "true" },
    });

    expect(() => driver.createSpecFrame({ linker: linkerSpec })).not.toThrow();
  });

  test("createSpecFrame works with numeric parentAxes (no annotation)", async () => {
    await using driver = new SpecDriver();
    const linkerAxes: AxisSpec[] = [
      { name: "pl7.app/sampleId", type: "String" },
      {
        name: "pl7.app/sc/cellId",
        type: "String",
        parentAxes: [0],
        annotations: { "pl7.app/label": "Cell ID" },
      },
      { name: "pl7.app/vdj/scClonotypeKey", type: "String" },
    ];
    const linkerSpec = createSpec("pl7.app/sc/cellLinker", linkerAxes, {
      annotations: { "pl7.app/isLinkerColumn": "true" },
    });

    expect(() => driver.createSpecFrame({ linker: linkerSpec })).not.toThrow();
  });

  test("createSpecFrame preserves non-parent annotations after conversion", async () => {
    await using driver = new SpecDriver();
    const axes: AxisSpec[] = [
      { name: "sample", type: "String" },
      {
        name: "cell",
        type: "String",
        annotations: {
          "pl7.app/parents": '["sample"]',
          "pl7.app/label": "Cell",
          "pl7.app/table/visibility": "default",
        },
      },
    ];
    const spec = createSpec("data-col", axes);

    const { key: handle } = driver.createSpecFrame({ col: spec });
    expect(handle).toBeDefined();

    const response = driver.discoverColumns(handle, {
      axes: [],
      maxHops: 0,
      constraints: {
        allowFloatingSourceAxes: true,
        allowFloatingHitAxes: true,
        allowSourceQualifications: false,
        allowHitQualifications: false,
      },
    });
    expect(response.hits).toHaveLength(1);
    const hitAxes = response.hits[0].hit.spec.axesSpec;
    const cellAxis = hitAxes.find((a: AxisSpec) => a.name === "cell");
    expect(cellAxis).toBeDefined();
    expect(cellAxis!.annotations?.["pl7.app/label"]).toBe("Cell");
    expect(cellAxis!.annotations?.["pl7.app/parents"]).toBeUndefined();
    expect(cellAxis!.parentAxes).toEqual([0]);
  });
});
