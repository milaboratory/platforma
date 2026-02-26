import { blockTest } from "@platforma-sdk/test";
import { blockSpec } from "this-block";
import type { PTableHandle } from "../../../../../lib/model/common/dist/drivers";

blockTest(
  "workflow produces table from PFrame",
  { timeout: 60000 },
  async ({ rawPrj: project, helpers, expect, ml }) => {
    const blockId = await project.addBlock("Block", blockSpec);

    await project.runBlock(blockId);
    const state = await helpers.awaitBlockDoneAndGetStableBlockState(blockId, 50000);

    const tableOutput = state.outputs!["table"] as {
      ok: boolean;
      value: { visibleTableHandle: string; fullTableHandle: string } | undefined;
    };
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

    // Column 0: axis "name"
    expect(data[0].type).toBe("String");
    expect([...data[0].data]).toEqual(["Alpha", "Beta", "Gamma", "Delta", "Epsilon"]);

    // Column 1: "value"
    expect(data[1].type).toBe("Int");
    expect([...data[1].data]).toEqual([10, 20, 30, 40, 50]);

    // Column 2: "category"
    expect(data[2].type).toBe("String");
    expect([...data[2].data]).toEqual(["A", "B", "A", "B", "A"]);
  },
);
