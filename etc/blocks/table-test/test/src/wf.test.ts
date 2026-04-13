import type { PTableHandle } from "@platforma-sdk/model";
import { blockTest } from "@platforma-sdk/test";
import { blockSpec } from "this-block";

type TableOutput = {
  ok: boolean;
  value: { visibleTableHandle: string; fullTableHandle: string } | undefined;
};

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
    // Block applies filter `value > 11` → 4 rows (Alpha with value=10 excluded).
    const fullHandle = tableOutput.value!.fullTableHandle as PTableHandle;
    const fullShape = await pFrameDriver.getShape(fullHandle);
    expect(fullShape.rows).toBe(4);
    expect(fullShape.columns).toBeGreaterThan(9); // well above direct-only count

    // Verify row contents on the full table — sorted by value ascending,
    // filtered to value > 11 → rows: B(20), C(30), D(40), E(50).
    const fullIndices = Array.from({ length: fullShape.columns }, (_, i) => i);
    const fullData = await pFrameDriver.getData(fullHandle, fullIndices);

    const findColumn = (type: string, expected: unknown[]) =>
      fullData.find(
        (c) => c.type === type && JSON.stringify([...c.data]) === JSON.stringify(expected),
      );

    // name axis — labels substituted via nameLabel column
    expect(
      findColumn("String", ["Beta sample", "Gamma sample", "Delta sample", "Epsilon sample"]),
    ).toBeDefined();
    // value column
    expect(findColumn("Int", [20, 30, 40, 50])).toBeDefined();
    // score column
    expect(findColumn("Double", [2.7, 3.1, 4.8, 5.0])).toBeDefined();
    // category column
    expect(findColumn("String", ["B", "A", "B", "A"])).toBeDefined();
    // note column
    expect(findColumn("String", ["world", "foo", "bar", "baz"])).toBeDefined();

    // Visible table should also resolve without "axis not present in join result" error.
    // columnsDisplayOptions hides "note" and marks "score" optional (hidden by default),
    // so visible table has fewer columns than full but still contains the remaining ones.
    const visibleHandle = tableOutput.value!.visibleTableHandle as PTableHandle;
    const visibleShape = await pFrameDriver.getShape(visibleHandle);
    expect(visibleShape.rows).toBe(4);
    expect(visibleShape.columns).toBeGreaterThan(3);

    const visibleIndices = Array.from({ length: visibleShape.columns }, (_, i) => i);
    const visibleData = await pFrameDriver.getData(visibleHandle, visibleIndices);
    const visibleValues = visibleData.map((c) => JSON.stringify([...c.data]));
    // "value" and "category" remain visible
    expect(visibleValues).toContain(JSON.stringify([20, 30, 40, 50]));
    expect(visibleValues).toContain(JSON.stringify(["B", "A", "B", "A"]));
  },
);
