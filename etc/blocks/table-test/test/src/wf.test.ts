import type { PTableHandle } from "@platforma-sdk/model";
import { blockTest } from "@platforma-sdk/test";
import { blockSpec } from "this-block";

type TableOutput = {
  ok: boolean;
  value: { visibleTableHandle: string; fullTableHandle: string } | undefined;
};

blockTest(
  "workflow produces table from PFrame",
  { timeout: 60000 },
  async ({ rawPrj: project, helpers, expect, ml }) => {
    const blockId = await project.addBlock("Block", blockSpec);

    await project.runBlock(blockId);
    const state = await helpers.awaitBlockDoneAndGetStableBlockState(blockId, 50000);

    const tableOutput = state.outputs!["tableV2"] as TableOutput;
    expect(tableOutput.ok).toBe(true);
    expect(tableOutput.value).toBeDefined();

    const pFrameDriver = ml.driverKit.pFrameDriver;

    // Full table should include all columns from the PFrame:
    //   Direct (5): name axis + value + score + category + note
    //   1-hop linked via name→group linker: group axis + description + priority + linker_name_group
    //   2-hop linked via name→group→region chain: region axis + regionName + population + linker_group_region
    const fullHandle = tableOutput.value!.fullTableHandle as PTableHandle;
    const fullShape = await pFrameDriver.getShape(fullHandle);
    expect(fullShape.rows).toBe(5);
    expect(fullShape.columns).toBeGreaterThanOrEqual(5); // at least name axis + 4 direct columns

    // Visible table — same as full since no columns are hidden by default
    const visibleHandle = tableOutput.value!.visibleTableHandle as PTableHandle;
    const visibleShape = await pFrameDriver.getShape(visibleHandle);
    expect(visibleShape.rows).toBe(5);
    expect(visibleShape.columns).toBeGreaterThanOrEqual(5);

    const allIndices = Array.from({ length: visibleShape.columns }, (_, i) => i);
    const data = await pFrameDriver.getData(visibleHandle, allIndices);
    console.log(JSON.stringify(data, null, 2));

    // Find and verify columns by their data content (sorted alphabetically by name axis)
    const findColumn = (type: string, expected: unknown[]) =>
      data.find((c) => c.type === type && JSON.stringify([...c.data]) === JSON.stringify(expected));

    // name axis
    expect(findColumn("String", ["Alpha", "Beta", "Delta", "Epsilon", "Gamma"])).toBeDefined();
    // category column
    expect(findColumn("String", ["A", "B", "B", "A", "A"])).toBeDefined();
    // value column
    expect(findColumn("Int", [10, 20, 40, 50, 30])).toBeDefined();
    // score column
    expect(findColumn("Double", [1.5, 2.7, 4.8, 5.0, 3.1])).toBeDefined();
    // note column
    expect(findColumn("String", ["hello", "world", "bar", "baz", "foo"])).toBeDefined();
  },
);

blockTest(
  "V3 table resolves linked columns through multi-hop linker chain",
  { timeout: 60000 },
  async ({ rawPrj: project, helpers, expect, ml }) => {
    const blockId = await project.addBlock("Block", blockSpec);

    await project.runBlock(blockId);
    const state = await helpers.awaitBlockDoneAndGetStableBlockState(blockId, 50000);

    const tableOutput = state.outputs!["tableV3"] as TableOutput;
    expect(tableOutput.ok).toBe(true);
    expect(tableOutput.value).toBeDefined();

    const pFrameDriver = ml.driverKit.pFrameDriver;

    // Full table should include:
    //   Direct (5): name axis + value + score + category + note
    //   1-hop linked via name→group linker: group axis + description + priority + linker_name_group
    //   2-hop linked via name→group→region chain: region axis + regionName + population + linker_group_region
    // Total: 5 + 4 + 4 = 13 columns (at least)
    const fullHandle = tableOutput.value!.fullTableHandle as PTableHandle;
    const fullShape = await pFrameDriver.getShape(fullHandle);
    expect(fullShape.rows).toBe(5);
    expect(fullShape.columns).toBeGreaterThan(9); // well above direct-only count

    // Visible table should also resolve without "axis not present in join result" error.
    const visibleHandle = tableOutput.value!.visibleTableHandle as PTableHandle;
    const visibleShape = await pFrameDriver.getShape(visibleHandle);
    expect(visibleShape.rows).toBe(5);
    expect(visibleShape.columns).toBeGreaterThan(3);
  },
);
