import { BlockPointer as enterNumberSpec } from "@milaboratories/milaboratories.test-enter-numbers";
import { BlockPointer as sumNumbersSpec } from "@milaboratories/milaboratories.test-sum-numbers";
import { DisconnectedError } from "@milaboratories/pl-client";
import { InitialBlockSettings, type PlRef } from "@milaboratories/pl-middle-layer";
import fs from "node:fs";
import * as fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assert, test } from "vitest";
import { isObject } from "@milaboratories/ts-helpers";
import { withMl, withMlAndProxy } from "./with-ml";
import { awaitBlockDone } from "./test-helpers";
import { deriveDataFromStorage } from "@platforma-sdk/model";

// oxlint-disable-next-line jest/no-disabled-tests
test.skip("v3: disconnect:runBlock throws DisconnectedError when connection drops mid-operation", async ({
  expect,
}) => {
  await expect(() =>
    withMlAndProxy(async (ml, _wd, proxy) => {
      const prj1Id = await ml.createProject({ label: "Project 1" });
      await ml.openProject(prj1Id);
      const prj = ml.getOpenedProject(prj1Id);

      expect(await prj.overview.awaitStableValue()).toMatchObject({
        meta: { label: "Project 1" },
        blocks: [],
      });

      const block1Id = await prj.addBlock("Block 1", enterNumberSpec);
      const block2Id = await prj.addBlock("Block 2", sumNumbersSpec);

      await prj.mutateBlockStorage(block1Id, {
        operation: "update-block-data",
        value: { numbers: [1, 2, 3] },
      });

      await prj.mutateBlockStorage(block2Id, {
        operation: "update-block-data",
        value: { sources: [outputRef(block1Id, "numbers")] },
      });

      // Start transaction without awaiting, disconnect while in-flight, then await result.
      const result = prj.runBlock(block2Id);

      await proxy.disconnectAll();

      await result;
      await awaitBlockDone(prj, block2Id);
    }),
  ).rejects.toThrow(DisconnectedError);
});

test("v3: project list manipulations test", async ({ expect }) => {
  await withMl(async (ml) => {
    const projectList = ml.projectList;

    expect(await projectList.awaitStableValue()).toEqual([]);

    const prj1Id = await ml.createProject({ label: "Project 1" });

    expect(await projectList.getValue()).toMatchObject([
      {
        id: prj1Id,
        meta: { label: "Project 1" },
        opened: false,
      },
    ]);

    await ml.setProjectMeta(prj1Id, { label: "Project 1A" });

    const listSnapshot1 = await projectList.getValue();
    expect(listSnapshot1).toMatchObject([
      {
        id: prj1Id,
        meta: { label: "Project 1A" },
        opened: false,
      },
    ]);
    expect(listSnapshot1![0].lastModified.valueOf()).toBeGreaterThan(
      listSnapshot1![0].created.valueOf(),
    );

    await ml.openProject(prj1Id);

    expect(await projectList.getValue()).toMatchObject([
      {
        id: prj1Id,
        meta: { label: "Project 1A" },
        opened: true,
      },
    ]);

    await ml.closeProject(prj1Id);

    expect(await projectList.getValue()).toMatchObject([
      {
        id: prj1Id,
        meta: { label: "Project 1A" },
        opened: false,
      },
    ]);

    await ml.deleteProject(prj1Id);

    expect(await projectList.awaitStableValue()).toEqual([]);
  });
});

test("v3: duplicate project test", async ({ expect }) => {
  await withMl(async (ml) => {
    const projectList = ml.projectList;

    // Create source project
    const srcPrjId = await ml.createProject({ label: "Source Project" });
    await ml.openProject(srcPrjId);
    const srcPrj = ml.getOpenedProject(srcPrjId);

    // Add blocks with args
    const block1Id = await srcPrj.addBlock("Enter Numbers", enterNumberSpec);
    const block2Id = await srcPrj.addBlock("Sum Numbers", sumNumbersSpec);

    await srcPrj.mutateBlockStorage(block1Id, {
      operation: "update-block-data",
      value: { numbers: [10, 20, 30] },
    });
    await srcPrj.mutateBlockStorage(block2Id, {
      operation: "update-block-data",
      value: { sources: [outputRef(block1Id, "numbers")] },
    });

    await ml.closeProject(srcPrjId);

    // Duplicate with rename lambda
    const prjDupId = await ml.duplicateProject(srcPrjId, (prevLabel, existingLabels) => {
      expect(existingLabels).toContain("Source Project");
      let candidate = `${prevLabel} (Copy)`;
      let i = 2;
      while (existingLabels.includes(candidate)) {
        candidate = `${prevLabel} (Copy ${i})`;
        i++;
      }
      return candidate;
    });

    // Verify project list has both projects
    const list = await projectList.getValue();
    assert(list);
    expect(list).toHaveLength(2);

    const srcEntry = list.find((p) => p.id === srcPrjId);
    const dupEntry = list.find((p) => p.id === prjDupId);
    assert(srcEntry);
    assert(dupEntry);
    expect(srcEntry.meta.label).toBe("Source Project");
    expect(dupEntry.meta.label).toBe("Source Project (Copy)");

    // Duplicate has different rid and fresh timestamps
    expect(prjDupId).not.toBe(srcPrjId);
    expect(dupEntry.created.valueOf()).toBeGreaterThanOrEqual(srcEntry.created.valueOf());

    // Open duplicate and verify structure
    await ml.openProject(prjDupId);
    const dupPrj = ml.getOpenedProject(prjDupId);

    const dupOverview = await dupPrj.overview.awaitStableValue();
    expect(dupOverview.meta.label).toBe("Source Project (Copy)");
    expect(dupOverview.blocks).toHaveLength(2);
    expect(dupOverview.blocks[0].title).toBeDefined();
    expect(dupOverview.blocks[1].title).toBeDefined();

    // Verify source project is unchanged
    await ml.openProject(srcPrjId);
    const srcPrj2 = ml.getOpenedProject(srcPrjId);
    const srcOverview = await srcPrj2.overview.awaitStableValue();
    expect(srcOverview.meta.label).toBe("Source Project");
    expect(srcOverview.blocks).toHaveLength(2);

    // Cleanup
    await ml.closeProject(prjDupId);
    await ml.closeProject(srcPrjId);
    await ml.deleteProject(prjDupId);
    await ml.deleteProject(srcPrjId);

    expect(await projectList.awaitStableValue()).toEqual([]);
  });
});

test("v3: duplicate project - name deduplication test", async ({ expect }) => {
  await withMl(async (ml) => {
    const projectList = ml.projectList;

    // Create two projects with names that would conflict
    const prj1Id = await ml.createProject({ label: "My Analysis" });
    const prj2Id = await ml.createProject({ label: "My Analysis (Copy)" });

    // Duplicate with dedup logic - should skip "My Analysis (Copy)" since it exists
    const prjDupId = await ml.duplicateProject(prj1Id, (prevLabel, existingLabels) => {
      let candidate = `${prevLabel} (Copy)`;
      let i = 2;
      while (existingLabels.includes(candidate)) {
        candidate = `${prevLabel} (Copy ${i})`;
        i++;
      }
      return candidate;
    });

    const list = await projectList.getValue();
    assert(list);
    expect(list).toHaveLength(3);
    const dupEntry = list.find((p) => p.id === prjDupId);
    assert(dupEntry);
    expect(dupEntry.meta.label).toBe("My Analysis (Copy 2)");

    // Cleanup
    await ml.deleteProject(prjDupId);
    await ml.deleteProject(prj2Id);
    await ml.deleteProject(prj1Id);
  });
});

test("v3: simple project manipulations test", { timeout: 40000 }, async ({ expect }) => {
  await withMl(async (ml) => {
    const projectList = ml.projectList;
    expect(await projectList.awaitStableValue()).toEqual([]);
    const prj1Id = await ml.createProject({ label: "Project 1" });
    const projectListValue1 = await projectList.getValue();
    expect(projectListValue1).toMatchObject([
      {
        id: prj1Id,
        meta: { label: "Project 1" },
        opened: false,
      },
    ]);

    const lastModInitial = projectListValue1![0].lastModified.valueOf();

    await ml.openProject(prj1Id);
    const prj = ml.getOpenedProject(prj1Id);

    expect(await prj.overview.awaitStableValue()).toMatchObject({
      meta: { label: "Project 1" },
      authorMarker: undefined,
      blocks: [],
    });
    await ml.setProjectMeta(
      prj1Id,
      { label: "New Project Label" },
      { authorId: "test_author", localVersion: 1 },
    );
    await prj.overview.refreshState();
    expect(await prj.overview.awaitStableValue()).toMatchObject({
      meta: { label: "New Project Label" },
      authorMarker: { authorId: "test_author", localVersion: 1 },
      blocks: [],
    });

    const block1Id = await prj.addBlock("Block 1", enterNumberSpec);
    const block2Id = await prj.addBlock("Block 2", enterNumberSpec);
    const block3Id = await prj.addBlock("Block 3", sumNumbersSpec);

    expect(await prj.overview.awaitStableValue()).toMatchObject({
      meta: { label: "New Project Label" },
      authorMarker: undefined,
    });

    const overviewSnapshot0 = await prj.overview.awaitStableValue();

    overviewSnapshot0.blocks.forEach((block) => {
      expect(block.sections).toBeDefined();
      expect(block.canRun).toEqual(false);
      expect(block.currentBlockPack).toBeDefined();
      expect(block.navigationState).toStrictEqual({ href: "/" });
    });

    const _block1StableState0 = await prj.getBlockState(block1Id).awaitStableValue();
    const _block2StableState0 = await prj.getBlockState(block2Id).awaitStableValue();
    const _block3StableState0 = await prj.getBlockState(block3Id).awaitStableValue();

    expect(_block1StableState0.outputs!["activeArgs"]).toStrictEqual({
      ok: true,
      value: undefined,
      stable: true,
    });

    await prj.setNavigationState(block1Id, { href: "/section1" });
    await prj.mutateBlockStorage(block1Id, {
      operation: "update-block-data",
      value: { numbers: [1, 2, 3] },
    });
    await prj.mutateBlockStorage(block2Id, {
      operation: "update-block-data",
      value: { numbers: [3, 4, 5] },
    });
    await prj.mutateBlockStorage(block3Id, {
      operation: "update-block-data",
      value: { sources: [outputRef(block1Id, "numbers"), outputRef(block2Id, "numbers")] },
    });
    await prj.runBlock(block3Id);
    await awaitBlockDone(prj, block3Id);
    const overviewSnapshot1 = await prj.overview.awaitStableValue();
    expect(overviewSnapshot1.lastModified.valueOf()).toBeGreaterThan(lastModInitial);

    overviewSnapshot1.blocks.forEach((block) => {
      expect(block.settings).toMatchObject(InitialBlockSettings);
      expect(block.sections).toBeDefined();
      expect(block.outputsError).toBeUndefined();
      expect(block.exportsError).toBeUndefined();
      expect(block.canRun).toEqual(false);
      expect(block.stale).toEqual(false);
      expect(block.currentBlockPack).toBeDefined();
      if (block.id === block1Id) expect(block.navigationState).toStrictEqual({ href: "/section1" });
      else expect(block.navigationState).toStrictEqual({ href: "/" });
    });
    // console.dir(overviewSnapshot1, { depth: 5 });
    const block1StableFrontend = await prj.getBlockFrontend(block1Id).awaitStableValue();
    expect(block1StableFrontend.url).toBeDefined();
    expect(block1StableFrontend.sdkVersion).toBeDefined();
    const block2StableFrontend = await prj.getBlockFrontend(block2Id).awaitStableValue();
    expect(block2StableFrontend.url).toMatch(/^block-ui:\/\//);
    expect(block2StableFrontend.sdkVersion).toBeDefined();
    const block3StableFrontend = await prj.getBlockFrontend(block3Id).awaitStableValue();
    expect(block3StableFrontend.url).toBeDefined();
    expect(block3StableFrontend.sdkVersion).toBeDefined();
    // console.dir({ block1StableFrontend, block2StableFrontend, block3StableFrontend }, { depth: 5 });

    const block1StableState1 = await prj.getBlockState(block1Id).awaitStableValue();
    const _block2StableState1 = await prj.getBlockState(block2Id).awaitStableValue();
    const block3StableState1 = await prj.getBlockState(block3Id).awaitStableValue();
    expect(block1StableState1.navigationState).toStrictEqual({ href: "/section1" });
    expect(_block2StableState1.navigationState).toStrictEqual({ href: "/" });
    expect(block3StableState1.navigationState).toStrictEqual({ href: "/" });
    console.dir(block1StableState1, { depth: 5 });
    console.dir(_block2StableState1, { depth: 5 });
    console.dir(block3StableState1, { depth: 5 });

    expect(block1StableState1.outputs!["activeArgs"]).toStrictEqual({
      ok: true,
      value: { numbers: [1, 2, 3] },
      stable: true,
    });

    expect(block3StableState1.outputs!["sum"]).toStrictEqual({
      ok: true,
      value: 18,
      stable: true,
    });

    const overviewSnapshot3 = await prj.overview.awaitStableValue();
    expect(overviewSnapshot3.blocks.find((b) => b.id === block3Id)?.stale).toEqual(false);
    expect(overviewSnapshot3.blocks.find((b) => b.id === block2Id)?.stale).toEqual(false);

    await prj.mutateBlockStorage(block2Id, {
      operation: "update-block-data",
      value: { numbers: [3, 4, 5] },
    });

    const overviewSnapshot4 = await prj.overview.awaitStableValue();
    expect(overviewSnapshot4.blocks.find((b) => b.id === block3Id)?.stale).toEqual(false);
    expect(overviewSnapshot4.blocks.find((b) => b.id === block2Id)?.stale).toEqual(false);

    await prj.resetBlockArgsAndUiState(block2Id);
    await prj.setBlockSettings(block2Id, { versionLock: "patch" });

    const block2State = await prj.getBlockState(block2Id).getValue();
    // V3 blocks store state directly without nested args/uiState structure
    console.log("block2State:----------------------------");
    console.dir(block2State, { depth: 5 });
    expect(deriveDataFromStorage(block2State.blockStorage)).toStrictEqual({
      numbers: [],
      labels: [],
      description: "",
    });

    const overviewSnapshot2 = await prj.overview.awaitStableValue();
    expect(overviewSnapshot2.blocks.find((b) => b.id === block3Id)?.canRun).toEqual(false);
    expect(overviewSnapshot2.blocks.find((b) => b.id === block3Id)?.stale).toEqual(true);
    expect(overviewSnapshot2.blocks.find((b) => b.id === block2Id)?.stale).toEqual(true);
    expect(overviewSnapshot2.blocks.find((b) => b.id === block2Id)?.settings).toEqual({
      versionLock: "patch",
    });
  });
});

test("v3: reorder & rename blocks", { timeout: 20000 }, async ({ expect }) => {
  await withMl(async (ml) => {
    const projectList = ml.projectList;
    expect(await projectList.awaitStableValue()).toEqual([]);
    const prj1Id = await ml.createProject({ label: "Project 1" });

    await ml.openProject(prj1Id);
    const prj = ml.getOpenedProject(prj1Id);

    const block1Id = await prj.addBlock("Block 1", enterNumberSpec);
    const block2Id = await prj.addBlock("Block 2", enterNumberSpec);
    const block3Id = await prj.addBlock("Block 3", sumNumbersSpec);

    const overviewSnapshot0 = await prj.overview.awaitStableValue();

    overviewSnapshot0.blocks.forEach((block) => {
      expect(block.sections).toBeDefined();
      expect(block.canRun).toEqual(false);
      expect(block.currentBlockPack).toBeDefined();
      expect(block.navigationState).toStrictEqual({ href: "/" });
    });

    await prj.setNavigationState(block1Id, { href: "/section1" });
    await prj.mutateBlockStorage(block1Id, {
      operation: "update-block-data",
      value: { numbers: [1, 2, 3] },
    });
    await prj.mutateBlockStorage(block2Id, {
      operation: "update-block-data",
      value: { numbers: [3, 4, 5] },
    });

    await prj.mutateBlockStorage(block3Id, {
      operation: "update-block-data",
      value: { sources: [outputRef(block1Id, "numbers"), outputRef(block2Id, "numbers")] },
    });
    await prj.runBlock(block3Id);
    await awaitBlockDone(prj, block3Id, 15000);

    const overviewSnapshot1 = await prj.overview.awaitStableValue();
    expect(overviewSnapshot1).toMatchObject({
      blocks: [
        { id: block1Id, calculationStatus: "Done" },
        { id: block2Id, calculationStatus: "Done" },
        { id: block3Id, calculationStatus: "Done" },
      ],
    });

    await prj.reorderBlocks([block2Id, block3Id, block1Id]);

    const overviewSnapshot2 = await prj.overview.awaitStableValue();
    expect(overviewSnapshot2).toMatchObject({
      blocks: [
        { id: block2Id, calculationStatus: "Done" },
        { id: block3Id, calculationStatus: "Limbo" },
        { id: block1Id, calculationStatus: "Done" },
      ],
    });
  });
});

test("v3: dependency test", { timeout: 20000 }, async ({ expect }) => {
  await withMl(async (ml) => {
    const projectList = ml.projectList;
    expect(await projectList.awaitStableValue()).toEqual([]);
    const prj1Id = await ml.createProject({ label: "Project 1" });

    await ml.openProject(prj1Id);
    const prj = ml.getOpenedProject(prj1Id);

    const block1Id = await prj.addBlock("Block 1", enterNumberSpec);
    const block2Id = await prj.addBlock("Block 2", enterNumberSpec);
    const block3Id = await prj.addBlock("Block 3", sumNumbersSpec);
    const block4Id = await prj.addBlock("Block 4", sumNumbersSpec);
    const block5Id = await prj.addBlock("Block 5", sumNumbersSpec);

    const overviewSnapshot0 = await prj.overview.awaitStableValue();

    overviewSnapshot0.blocks.forEach((block) => {
      expect(block.sections).toBeDefined();
      expect(block.canRun).toEqual(false);
      expect(block.currentBlockPack).toBeDefined();
      expect(block.navigationState).toStrictEqual({ href: "/" });
    });

    await prj.setNavigationState(block1Id, { href: "/section1" });
    await prj.mutateBlockStorage(block1Id, {
      operation: "update-block-data",
      value: { numbers: [1, 2, 3] },
    });
    await prj.mutateBlockStorage(block2Id, {
      operation: "update-block-data",
      value: { numbers: [3, 4, 5] },
    });
    await prj.mutateBlockStorage(block3Id, {
      operation: "update-block-data",
      value: { sources: [outputRef(block1Id, "numbers"), outputRef(block2Id, "numbers")] },
    });
    await prj.mutateBlockStorage(block4Id, {
      operation: "update-block-data",
      value: { sources: [outputRef(block1Id, "numbers"), outputRef(block2Id, "numbers")] },
    });
    await prj.mutateBlockStorage(block5Id, {
      operation: "update-block-data",
      value: { sources: [outputRef(block1Id, "numbers"), outputRef(block2Id, "numbers")] },
    });
    const overviewSnapshot1 = await prj.overview.awaitStableValue();

    expect(overviewSnapshot1.blocks).toMatchObject([
      { upstreams: [], downstreams: [block3Id, block4Id, block5Id] },
      { upstreams: [], downstreams: [block3Id, block4Id, block5Id] },
      { upstreams: [block1Id, block2Id], downstreams: [] },
      { upstreams: [block1Id, block2Id], downstreams: [] },
      { upstreams: [block1Id, block2Id], downstreams: [] },
    ]);

    await prj.mutateBlockStorage(block3Id, {
      operation: "update-block-data",
      value: {
        sources: [outputRef(block1Id, "numbers", true), outputRef(block2Id, "numbers", true)],
      },
    });
    await prj.mutateBlockStorage(block4Id, {
      operation: "update-block-data",
      value: { sources: [outputRef(block2Id, "numbers", true)] },
    });
    await prj.mutateBlockStorage(block5Id, {
      operation: "update-block-data",
      value: { sources: [outputRef(block1Id, "numbers", true)] },
    });
    const overviewSnapshot2 = await prj.overview.awaitStableValue();

    expect(
      overviewSnapshot2.blocks.map((b) => ({
        upstreams: new Set(b.upstreams),
        downstreams: new Set(b.downstreams),
      })),
    ).toMatchObject([
      { upstreams: new Set(), downstreams: new Set([block3Id, block5Id]) },
      { upstreams: new Set(), downstreams: new Set([block3Id, block4Id, block5Id]) },
      { upstreams: new Set([block1Id, block2Id]), downstreams: new Set([block5Id]) },
      { upstreams: new Set([block2Id]), downstreams: new Set() },
      { upstreams: new Set([block1Id, block2Id, block3Id]), downstreams: new Set() },
    ]);
  });
});

test(
  "v3: column links reach the block state, not the overview",
  { timeout: 20000 },
  async ({ expect }) => {
    await withMl(async (ml) => {
      const prjId = await ml.createProject({ label: "Project 1" });
      await ml.openProject(prjId);
      const prj = ml.getOpenedProject(prjId);

      const block1Id = await prj.addBlock("Block 1", enterNumberSpec);
      const block2Id = await prj.addBlock("Block 2", sumNumbersSpec);
      await prj.mutateBlockStorage(block1Id, {
        operation: "update-block-data",
        value: { numbers: [1, 2, 3] },
      });
      await prj.mutateBlockStorage(block2Id, {
        operation: "update-block-data",
        value: { sources: [outputRef(block1Id, "numbers")] },
      });

      const beforeRun = await prj.getBlockState(block2Id).awaitStableValue();
      expect(beforeRun.columnLinks?.dependencies).toMatchObject([
        {
          producer: { blockId: block1Id, name: "numbers" },
          holderBlockId: block2Id,
          check: { type: "notRun" },
        },
      ]);

      await prj.runBlock(block2Id);
      await awaitBlockDone(prj, block2Id);

      const overview = await prj.overview.awaitStableValue();
      for (const block of overview.blocks) expect(block).not.toHaveProperty("columnLinks");
      const block1Title = overview.blocks.find((b) => b.id === block1Id)?.title;
      expect(block1Title).toBeDefined();

      const block2State = await prj.getBlockState(block2Id).awaitStableValue();
      expect(block2State.columnLinks).toMatchObject({
        dependencies: [{ producer: { blockId: block1Id, name: "numbers" } }],
        labels: { [block1Id]: block1Title },
      });
      expect(block2State.columnLinks?.dependencies[0]?.check.type).not.toEqual("notRun");

      const block1State = await prj.getBlockState(block1Id).awaitStableValue();
      expect(block1State.columnLinks?.dependents).toMatchObject([
        { producer: { blockId: block1Id, name: "numbers" }, holderBlockId: block2Id },
      ]);
    });
  },
);

test("v3: limbo test", async ({ expect }) => {
  await withMl(async (ml) => {
    const prj1Id = await ml.createProject({ label: "Project 1" });
    await ml.openProject(prj1Id);
    const prj = ml.getOpenedProject(prj1Id);

    const block1Id = await prj.addBlock("Block 1", enterNumberSpec);
    const block2Id = await prj.addBlock("Block 2", sumNumbersSpec);

    const overview0 = await prj.overview.awaitStableValue();
    overview0.blocks.forEach((block) => {
      expect(block.sections).toBeDefined();
      expect(block.canRun).toEqual(false);
      expect(block.currentBlockPack).toBeDefined();
    });

    await prj.mutateBlockStorage(block1Id, {
      operation: "update-block-data",
      value: { numbers: [1, 2, 3] },
    });
    // V3 Heavy blocks need to be run to produce outputs
    await prj.runBlock(block1Id);
    await awaitBlockDone(prj, block1Id);

    await prj.mutateBlockStorage(block2Id, {
      operation: "update-block-data",
      value: { sources: [outputRef(block1Id, "numbers")] },
    });

    const overview1 = await prj.overview.awaitStableValue();
    // After running block1, block2 should be runnable
    expect(overview1.blocks[0].canRun).toEqual(false); // block1 is done
    expect(overview1.blocks[1].canRun).toEqual(true); // block2 can run

    await prj.runBlock(block2Id);
    await awaitBlockDone(prj, block2Id);

    const block2StableState1 = await prj.getBlockState(block2Id).getValue();
    expect(block2StableState1.outputs!["sum"]).toStrictEqual({
      ok: true,
      value: 6,
      stable: true,
    });

    const overview2 = await prj.overview.awaitStableValue();
    overview2.blocks.forEach((block) => {
      expect(block.sections).toBeDefined();
      expect(block.calculationStatus).toEqual("Done");
      expect(block.canRun).toEqual(false);
      expect(block.currentBlockPack).toBeDefined();
    });

    await prj.mutateBlockStorage(block1Id, {
      operation: "update-block-data",
      value: { numbers: [2, 3] },
    });
    await prj.runBlock(block1Id);
    await awaitBlockDone(prj, block1Id);

    const overview3 = await prj.overview.awaitStableValue();
    const [overview3Block1, overview3Block2] = overview3.blocks;
    expect(overview3Block1.calculationStatus).toEqual("Done");
    expect(overview3Block2.calculationStatus).toEqual("Limbo");

    await prj.runBlock(block2Id);
    await awaitBlockDone(prj, block2Id);

    const block2StableState2 = await prj.getBlockState(block2Id).getValue();
    expect(block2StableState2.outputs!["sum"]).toStrictEqual({
      ok: true,
      value: 5,
      stable: true,
    });

    const overview4 = await prj.overview.awaitStableValue();
    const [overview4Block1, overview4Block2] = overview4.blocks;
    expect(overview4Block1.calculationStatus).toEqual("Done");
    expect(overview4Block2.calculationStatus).toEqual("Done");
  });
});

test("v3: test error propagation", async ({ expect }) => {
  await withMl(async (ml) => {
    const prj1Id = await ml.createProject({ label: "Project 1" });
    await ml.openProject(prj1Id);
    const prj = ml.getOpenedProject(prj1Id);

    const block1Id = await prj.addBlock("Block 1", enterNumberSpec);

    const overview0 = await prj.overview.awaitStableValue();
    overview0.blocks.forEach((block) => {
      expect(block.sections).toBeDefined();
      expect(block.canRun).toEqual(false);
      expect(block.currentBlockPack).toBeDefined();
    });

    await prj.mutateBlockStorage(block1Id, {
      operation: "update-block-data",
      value: { numbers: [1] },
    });

    const block1StableState1 = await prj.getBlockState(block1Id).awaitStableValue();
    expect(block1StableState1.outputs!["errorIfNumberIs999"]).toStrictEqual({
      ok: true,
      value: [1],
      stable: true,
    });

    await prj.mutateBlockStorage(block1Id, {
      operation: "update-block-data",
      value: { numbers: [999] },
    });

    const block1StableState2 = await prj.getBlockState(block1Id).awaitStableValue();

    const result = block1StableState2.outputs!["errorIfNumberIs999"];

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Result is ok (unexpected)");
    }

    expect(result.errors).toHaveLength(1);
    // V3 blocks produce PlQuickJSError when trying to access non-existent prerun output
    expect(result.errors[0].name).toBe("PlQuickJSError");
  });
});

test("v3: block duplication test", async ({ expect }) => {
  await withMl(async (ml) => {
    const prj1Id = await ml.createProject({ label: "Project 1" });
    await ml.openProject(prj1Id);
    const prj = ml.getOpenedProject(prj1Id);

    // Create original block with some configuration
    const originalBlockId = await prj.addBlock("Original Block", enterNumberSpec);
    await prj.mutateBlockStorage(originalBlockId, {
      operation: "update-block-data",
      value: { numbers: [1, 2, 3] },
    });
    await prj.setBlockSettings(originalBlockId, { versionLock: "patch" });

    // Get initial overview
    const overviewBefore = await prj.overview.awaitStableValue();
    expect(overviewBefore.blocks).toHaveLength(1);
    expect(overviewBefore.blocks[0].label).toBe("Original Block");

    // Duplicate the block
    const duplicatedBlockId = await prj.duplicateBlock(originalBlockId);

    // Verify the duplicated block exists
    const overviewAfter = await prj.overview.awaitStableValue();
    expect(overviewAfter.blocks).toHaveLength(2);

    const originalBlock = overviewAfter.blocks.find((b) => b.id === originalBlockId);
    const duplicatedBlock = overviewAfter.blocks.find((b) => b.id === duplicatedBlockId);

    expect(originalBlock).toBeDefined();
    expect(duplicatedBlock).toBeDefined();

    // Verify block structure is copied
    expect(duplicatedBlock!.label).toBe("Original Block");
    expect(duplicatedBlock!.currentBlockPack).toEqual(originalBlock!.currentBlockPack);
    expect(duplicatedBlock!.settings).toEqual(originalBlock!.settings);

    // Verify block state is copied
    const originalState = await prj.getBlockState(originalBlockId).awaitStableValue();
    const duplicatedState = await prj.getBlockState(duplicatedBlockId).awaitStableValue();

    expect(duplicatedState.blockStorage).toEqual(originalState.blockStorage);

    // Verify they are independent - changing one shouldn't affect the other
    await prj.mutateBlockStorage(originalBlockId, {
      operation: "update-block-data",
      value: { numbers: [4, 5, 6] },
    });

    const originalStateAfter = await prj.getBlockState(originalBlockId).awaitStableValue();
    const duplicatedStateAfter = await prj.getBlockState(duplicatedBlockId).awaitStableValue();

    const orig = deriveDataFromStorage(originalStateAfter.blockStorage);
    const dup = deriveDataFromStorage(duplicatedStateAfter.blockStorage);

    if (!(isObject(orig) && "numbers" in orig)) {
      throw new Error("s1 is not an object");
    }

    if (!(isObject(dup) && "numbers" in dup)) {
      throw new Error("s2 is not an object");
    }

    expect(orig.numbers).toEqual([4, 5, 6]);
    expect(dup.numbers).toEqual([1, 2, 3]); // unchanged
  });
});

test("v3: block update test", async ({ expect }) => {
  await withMl(async (ml, workFolder) => {
    const prj1Id = await ml.createProject({ label: "Project 1" });
    await ml.openProject(prj1Id);
    const prj = ml.getOpenedProject(prj1Id);

    const tmpDevBlockFolder = path.resolve(workFolder, "dev");
    await fs.promises.mkdir(tmpDevBlockFolder, { recursive: true });

    // Build a dev-v2 pointer from the from-pack-v2 BlockPointer's `rootUrl` (the facade
    // root is exactly the dev block folder) so the block-pack update watcher
    // (dev-folder) drives updatedBlockPack; dev-v2 `folder` is a path, so convert the
    // file: URL at this edge.
    const enterNumberDevSpec = {
      type: "dev-v2" as const,
      folder: fileURLToPath(enterNumberSpec.rootUrl),
    };
    const block1Id = await prj.addBlock("Block 1", enterNumberDevSpec);

    const overview0 = await prj.overview.awaitStableValue();
    expect(overview0.blocks[0].updatedBlockPack).toBeUndefined();

    // touch
    await fs.promises.appendFile(
      path.resolve("..", "..", "etc", "blocks", "enter-numbers", "model", "dist", "model.json"),
      " ",
    );

    // await update watcher
    await prj.overview.refreshState();
    const overview1 = await prj.overview.awaitStableValue();
    expect(overview1.blocks[0].updatedBlockPack).toBeDefined();

    await prj.updateBlockPack(block1Id, overview1.blocks[0].updatedBlockPack!);

    const overview2 = await prj.overview.awaitStableValue();
    expect(overview2.blocks[0].currentBlockPack).toStrictEqual(
      overview1.blocks[0].updatedBlockPack,
    );
    expect(overview2.blocks[0].updatedBlockPack).toBeUndefined();
  });
});

test("v3: from-pack-v2 block update test", async ({ expect }) => {
  await withMl(async (ml, workFolder) => {
    const prj1Id = await ml.createProject({ label: "Project 1" });
    await ml.openProject(prj1Id);
    const prj = ml.getOpenedProject(prj1Id);

    // Copy the block-pack into a temp dir so we can simulate a rebuild (advancing
    // the manifest timestamp) without mutating the shared etc/blocks fixture.
    const srcPackDir = fileURLToPath(enterNumberSpec.packUrl);
    const tmpPackDir = path.resolve(workFolder, "block-pack");
    await fsp.cp(srcPackDir, tmpPackDir, { recursive: true });

    const fromPackSpec = {
      type: "from-pack-v2" as const,
      packUrl: pathToFileURL(tmpPackDir).href,
    };
    const block1Id = await prj.addBlock("Block 1", fromPackSpec);

    const overview0 = await prj.overview.awaitStableValue();
    expect(overview0.blocks[0].updatedBlockPack).toBeUndefined();

    // simulate a pack rebuild: advance the manifest timestamp
    const manifestPath = path.join(tmpPackDir, "manifest.json");
    const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf-8")) as { timestamp: number };
    manifest.timestamp = manifest.timestamp + 1000;
    await fsp.writeFile(manifestPath, JSON.stringify(manifest));

    // await update watcher
    await prj.overview.refreshState();
    const overview1 = await prj.overview.awaitStableValue();
    expect(overview1.blocks[0].updatedBlockPack).toBeDefined();

    await prj.updateBlockPack(block1Id, overview1.blocks[0].updatedBlockPack!);

    const overview2 = await prj.overview.awaitStableValue();
    expect(overview2.blocks[0].currentBlockPack).toStrictEqual(
      overview1.blocks[0].updatedBlockPack,
    );
    expect(overview2.blocks[0].updatedBlockPack).toBeUndefined();
  });
});

test("v3: project open and close test", async ({ expect }) => {
  await withMl(async (ml) => {
    const prj1Id = await ml.createProject({ label: "Project 1" });
    await ml.openProject(prj1Id);
    let prj = ml.getOpenedProject(prj1Id);

    const blockId = await prj.addBlock("Test Block", enterNumberSpec);
    await prj.mutateBlockStorage(blockId, {
      operation: "update-block-data",
      value: { numbers: [1, 2, 3] },
    });
    const overview1 = await prj.overview.awaitStableValue();
    expect(overview1.blocks[0].canRun).toEqual(true);

    ml.closeProject(prj1Id);
    await ml.openProject(prj1Id);
    prj = ml.getOpenedProject(prj1Id);

    const overview2 = await prj.overview.awaitStableValue();
    expect(overview2.blocks[0].canRun).toEqual(true);
  });
});

test("v3: block error test", async ({ expect }) => {
  await withMl(async (ml) => {
    const prj1Id = await ml.createProject({ label: "Project 1" });
    await ml.openProject(prj1Id);
    const prj = ml.getOpenedProject(prj1Id);

    expect(await prj.overview.awaitStableValue()).toMatchObject({
      meta: { label: "Project 1" },
      blocks: [],
    });

    const block3Id = await prj.addBlock("Block 3", sumNumbersSpec);

    await prj.mutateBlockStorage(block3Id, {
      operation: "update-block-data",
      value: { sources: [] }, // empty reference list should produce an error
    });

    // In V3, with empty sources the args() function throws "Sources are required"
    // This means the block can't derive valid args and won't be runnable
    const overviewSnapshot1 = await prj.overview.awaitStableValue();

    overviewSnapshot1.blocks.forEach((block) => {
      expect(block.sections).toBeDefined();
    });
    // V3 blocks with failed args derivation cannot run
    expect(overviewSnapshot1.blocks[0].canRun).toBe(false);

    const block3StableState = await prj.getBlockState(block3Id).getValue();

    const sum = block3StableState.outputs!["sum"];
    console.log("sum output:", sum);
    // In V3, sum may be ok:true with undefined value when args fails, or ok:false with error
    if (sum.ok) {
      // V3 behavior: output resolver returns undefined when ctx.outputs is undefined
      expect(sum.value).toBeUndefined();
    } else {
      console.log("ml, block error test, the error:");
      console.dir(sum.errors[0], { depth: 150 });
      // V3 error message comes from the args() function
      expect(typeof sum.errors[0] == "string" ? sum.errors[0] : sum.errors[0].message).toContain(
        "Sources are required",
      );
    }
  });
});

function outputRef(blockId: string, name: string, requireEnrichments?: true): PlRef {
  return { __isRef: true, blockId, name, requireEnrichments };
}
