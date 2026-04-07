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
    const handle = tableOutput.value!.visibleTableHandle as PTableHandle;

    const shape = await pFrameDriver.getShape(handle);
    expect(shape.rows).toBe(5);
    expect(shape.columns).toBeGreaterThanOrEqual(2); // at least axis + 1 column

    const allIndices = Array.from({ length: shape.columns }, (_, i) => i);
    const data = await pFrameDriver.getData(handle, allIndices);
    expect(data.length).toBe(3);

    expect(data[0].type).toBe("String");
    expect([...data[0].data]).toEqual(["Alpha", "Beta", "Delta", "Epsilon", "Gamma"]);

    expect(data[1].type).toBe("String");
    expect([...data[1].data]).toEqual(["A", "B", "B", "A", "A"]);

    expect(data[2].type).toBe("Int");
    expect([...data[2].data]).toEqual([10, 20, 40, 50, 30]);
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
