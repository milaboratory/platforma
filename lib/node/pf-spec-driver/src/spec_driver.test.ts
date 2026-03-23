import type { AxisSpec, PColumnSpec } from "@milaboratories/pl-model-common";
import { describe, expect, test } from "vitest";
import { SpecDriver } from "./spec_driver";

function createSpec(name: string, axesSpec?: AxisSpec[]): PColumnSpec {
  return {
    kind: "PColumn",
    name,
    valueType: "Int",
    axesSpec: axesSpec ?? [{ name: "id", type: "String" } as AxisSpec],
    annotations: {},
  } as PColumnSpec;
}

describe("SpecDriver", () => {
  test("discoverColumns returns all columns with no filters", () => {
    const driver = new SpecDriver();
    const handle = driver.createSpecFrame({
      col1: createSpec("col1"),
      col2: createSpec("col2"),
    });

    const response = driver.specFrameDiscoverColumns(handle, {
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

    driver.specFrameDispose(handle);
  });
});
