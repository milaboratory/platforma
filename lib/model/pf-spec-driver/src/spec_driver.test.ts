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
    expect(cellAxis!.annotations?.["pl7.app/parents"]).toBe('["sample"]');
    expect(cellAxis!.parentAxes).toEqual([0]);
  });

  test("discoverColumns discovers columns through linker", async () => {
    await using driver = new SpecDriver();

    const nameAxis: AxisSpec = {
      name: "name",
      type: "String",
      annotations: { "pl7.app/label": "Name" },
    } as AxisSpec;
    const groupAxis: AxisSpec = {
      name: "group",
      type: "String",
      annotations: { "pl7.app/label": "Group" },
    } as AxisSpec;

    const { key: handle } = driver.createSpecFrame({
      note: {
        kind: "PColumn",
        name: "note",
        valueType: "String",
        axesSpec: [nameAxis],
        annotations: { "pl7.app/label": "Note" },
      } as PColumnSpec,
      value: {
        kind: "PColumn",
        name: "value",
        valueType: "Int",
        axesSpec: [nameAxis],
        annotations: { "pl7.app/label": "Value" },
      } as PColumnSpec,
      description: {
        kind: "PColumn",
        name: "description",
        valueType: "String",
        axesSpec: [groupAxis],
        annotations: { "pl7.app/label": "Description" },
      } as PColumnSpec,
      priority: {
        kind: "PColumn",
        name: "priority",
        valueType: "Int",
        axesSpec: [groupAxis],
        annotations: { "pl7.app/label": "Priority" },
      } as PColumnSpec,
      linker_name_group: {
        kind: "PColumn",
        name: "linker_name_group",
        valueType: "Int",
        axesSpec: [groupAxis, nameAxis],
        annotations: {
          "pl7.app/isLinkerColumn": "true",
          "pl7.app/linkLabel": "Name-Group Linker",
        },
      } as PColumnSpec,
    });

    const response = driver.discoverColumns(handle, {
      axes: [{ axesSpec: [{ type: "String", name: "name" } as AxisSpec], qualifications: [] }],
      maxHops: 1,
      constraints: {
        allowFloatingSourceAxes: true,
        allowFloatingHitAxes: true,
        allowSourceQualifications: true,
        allowHitQualifications: true,
      },
    });

    const names = response.hits.map((h) => h.hit.spec.name);
    expect(names).toContain("note");
    expect(names).toContain("value");
    expect(names).toContain("description");
    expect(names).toContain("priority");
    expect(response.hits).toHaveLength(4);

    // Linked columns should have non-empty path
    const linkedHits = response.hits.filter((h) => h.path.length > 0);
    expect(linkedHits).toHaveLength(2);
    const linkedNames = linkedHits.map((h) => h.hit.spec.name);
    expect(linkedNames).toContain("description");
    expect(linkedNames).toContain("priority");
  });
});
