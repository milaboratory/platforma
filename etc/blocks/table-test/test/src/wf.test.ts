import type { PTableHandle } from "@platforma-sdk/model";
import { blockTest } from "@platforma-sdk/test";
import { TestBlockTableBlockPointer } from "this-block";

type TableOutput =
  | { ok: true; value: { visibleTableHandle: string; fullTableHandle: string }; stable: boolean }
  | { ok: false; errors: { message?: string }[]; moreErrors: boolean };

blockTest(
  "V3 table resolves linked columns through multi-hop linker chain",
  { timeout: 60000 },
  async ({ rawPrj: project, helpers, expect, ml }) => {
    const blockId = await project.addBlock("Block", TestBlockTableBlockPointer);

    await project.runBlock(blockId);
    const state = await helpers.awaitBlockDoneAndGetStableBlockState(blockId, 50000);

    const tableOutput = state.outputs!["tableV3"] as TableOutput;
    if (!tableOutput.ok) {
      throw new Error(
        `tableV3 failed:\n${tableOutput.errors.map((e) => e.message ?? JSON.stringify(e)).join("\n")}`,
      );
    }

    const pFrameDriver = ml.driverKit.pFrameDriver;

    // Full table should include:
    //   Direct (5): name axis + value + score + category + note
    //   1-hop linked via name→group linker: group axis + description + priority + linker_name_group
    //   2-hop linked via name→group→region chain: region axis + regionName + population + linker_group_region
    // Total: 5 + 4 + 4 = 13 columns (at least)
    // Block applies filter `value > 11` → 4 rows (Alpha with value=10 excluded).
    const fullHandle = tableOutput.value.fullTableHandle as PTableHandle;
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
    const visibleHandle = tableOutput.value.visibleTableHandle as PTableHandle;
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

blockTest(
  "V3 split table fans out `count` over the `group` partition axis",
  { timeout: 60000 },
  async ({ rawPrj: project, helpers, expect, ml }) => {
    const blockId = await project.addBlock("Block", TestBlockTableBlockPointer);

    await project.runBlock(blockId);
    const state = await helpers.awaitBlockDoneAndGetStableBlockState(blockId, 50000);

    const splitOutput = state.outputs!["tableSplitV3"] as TableOutput;
    if (!splitOutput.ok) {
      throw new Error(
        `tableSplitV3 failed:\n${splitOutput.errors.map((e) => e.message ?? JSON.stringify(e)).join("\n")}`,
      );
    }

    const pFrameDriver = ml.driverKit.pFrameDriver;

    // tableSplitV3 has no filter and no sort override — primary is `value`
    // discovered via {main: value@name}; all 5 names participate.
    const fullHandle = splitOutput.value.fullTableHandle as PTableHandle;
    const fullShape = await pFrameDriver.getShape(fullHandle);
    expect(fullShape.rows).toBe(5);

    const fullIndices = Array.from({ length: fullShape.columns }, (_, i) => i);
    const fullData = await pFrameDriver.getData(fullHandle, fullIndices);

    // `count` (group, name) is partitioned by `group`. expandByPartition fans
    // it out into one column per group value — G1 and G2. Each split column
    // has `group` axis sliced away and its `domain.group = "<value>"` patched
    // via specOverride. The values come from count.tsv:
    //   G1: A=100, B=200, C=10,  D=25, E=5
    //   G2: A=50,  B=150, C=300, D=75, E=1000
    const findInt = (expected: number[]) =>
      fullData.find(
        (c) => c.type === "Int" && JSON.stringify([...c.data]) === JSON.stringify(expected),
      );

    expect(findInt([100, 200, 10, 25, 5])).toBeDefined();
    expect(findInt([50, 150, 300, 75, 1000])).toBeDefined();
  },
);
