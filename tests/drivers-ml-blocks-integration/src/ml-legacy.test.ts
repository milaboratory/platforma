import { BlockPointer as downloadFileSpec } from "@milaboratories/milaboratories.test-download-file";
import type { platforma as downloadFileModel } from "@milaboratories/milaboratories.test-download-file.model";
import { BlockPointer as enterNumberSpec } from "@milaboratories/milaboratories.test-enter-numbers";
import { BlockPointer as sumNumbersSpec } from "@milaboratories/milaboratories.test-sum-numbers";
import { BlockPointer as uploadFileSpec } from "@milaboratories/milaboratories.test-upload-file";
import type { platforma as uploadFileModel } from "@milaboratories/milaboratories.test-upload-file.model";
import { DisconnectedError } from "@milaboratories/pl-client";
import {
  type ImportFileHandle,
  type InferBlockState,
  InitialBlockSettings,
  type LocalBlobHandleAndSize,
  type PlRef,
  type RemoteBlobHandleAndSize,
} from "@milaboratories/pl-middle-layer";
import type { MiddleLayer } from "@milaboratories/pl-middle-layer";
import { awaitStableState, blockTest } from "@platforma-sdk/test";
import { deriveDataFromStorage } from "@platforma-sdk/model";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assert, test } from "vitest";
import { isObject } from "@milaboratories/ts-helpers";
import { withMl, withMlAndProxy } from "./with-ml";
import { awaitBlockDone } from "./test-helpers";

// oxlint-disable-next-line jest/no-disabled-tests
test.skip("disconnect:runBlock throws DisconnectedError when connection drops mid-operation", async ({
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

      await prj.setBlockArgs(block1Id, { numbers: [1, 2, 3] });

      await prj.setBlockArgs(block2Id, {
        sources: [outputRef(block1Id, "numbers")],
      });

      // Start transaction without awaiting, disconnect while in-flight, then await result.
      const result = prj.runBlock(block2Id);

      await proxy.disconnectAll();

      await result;
      await awaitBlockDone(prj, block2Id);
    }),
  ).rejects.toThrow(DisconnectedError);
});

test("project list manipulations test", async ({ expect }) => {
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

test("duplicate project test", async ({ expect }) => {
  await withMl(async (ml) => {
    const projectList = ml.projectList;

    // Create source project
    const srcPrjId = await ml.createProject({ label: "Source Project" });
    await ml.openProject(srcPrjId);
    const srcPrj = ml.getOpenedProject(srcPrjId);

    // Add blocks with args
    const block1Id = await srcPrj.addBlock("Enter Numbers", enterNumberSpec);
    const block2Id = await srcPrj.addBlock("Sum Numbers", sumNumbersSpec);

    await srcPrj.setBlockArgs(block1Id, { numbers: [10, 20, 30] });
    await srcPrj.setBlockArgs(block2Id, {
      sources: [outputRef(block1Id, "numbers")],
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

test("duplicate project - name deduplication test", async ({ expect }) => {
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

test("simple project manipulations test", { timeout: 30000, retry: 3 }, async ({ expect }) => {
  // Baseline stat:
  // (1a) {"committed":{"txCount":41,"rootsCreated":0,"structsCreated":18,"structsCreatedDataBytes":487161,"ephemeralsCreated":125,"ephemeralsCreatedDataBytes":3033,"valuesCreated":113,"valuesCreatedDataBytes":574938,"kvSetRequests":33,"kvSetBytes":33,"inputsLocked":79,"outputsLocked":59,"fieldsCreated":439,"fieldsSet":516,"fieldsGet":3,"rGetDataCacheHits":180,"rGetDataCacheFields":0,"rGetDataCacheBytes":160264,"rGetDataNetRequests":129,"rGetDataNetFields":578,"rGetDataNetBytes":478364,"kvListRequests":121,"kvListEntries":283,"kvListBytes":19773,"kvGetRequests":75,"kvGetBytes":5212},"conflict":{"txCount":1,"rootsCreated":0,"structsCreated":0,"structsCreatedDataBytes":0,"ephemeralsCreated":24,"ephemeralsCreatedDataBytes":630,"valuesCreated":4,"valuesCreatedDataBytes":86,"kvSetRequests":1,"kvSetBytes":1,"inputsLocked":10,"outputsLocked":6,"fieldsCreated":26,"fieldsSet":40,"fieldsGet":0,"rGetDataCacheHits":21,"rGetDataCacheFields":0,"rGetDataCacheBytes":434,"rGetDataNetRequests":4,"rGetDataNetFields":31,"rGetDataNetBytes":0,"kvListRequests":1,"kvListEntries":9,"kvListBytes":703,"kvGetRequests":5,"kvGetBytes":427},"error":{"txCount":0,"rootsCreated":0,"structsCreated":0,"structsCreatedDataBytes":0,"ephemeralsCreated":0,"ephemeralsCreatedDataBytes":0,"valuesCreated":0,"valuesCreatedDataBytes":0,"kvSetRequests":0,"kvSetBytes":0,"inputsLocked":0,"outputsLocked":0,"fieldsCreated":0,"fieldsSet":0,"fieldsGet":0,"rGetDataCacheHits":0,"rGetDataCacheFields":0,"rGetDataCacheBytes":0,"rGetDataNetRequests":0,"rGetDataNetFields":0,"rGetDataNetBytes":0,"kvListRequests":0,"kvListEntries":0,"kvListBytes":0,"kvGetRequests":0,"kvGetBytes":0}}
  // (2a) {"committed":{"txCount":41,"rootsCreated":0,"structsCreated":18,"structsCreatedDataBytes":487161,"ephemeralsCreated":113,"ephemeralsCreatedDataBytes":2718,"valuesCreated":111,"valuesCreatedDataBytes":574895,"kvSetRequests":32,"kvSetBytes":32,"inputsLocked":74,"outputsLocked":56,"fieldsCreated":432,"fieldsSet":496,"fieldsGet":3,"rGetDataCacheHits":180,"rGetDataCacheFields":0,"rGetDataCacheBytes":160269,"rGetDataNetRequests":128,"rGetDataNetFields":573,"rGetDataNetBytes":478364,"kvListRequests":120,"kvListEntries":284,"kvListBytes":19830,"kvGetRequests":75,"kvGetBytes":5212},"conflict":{"txCount":1,"rootsCreated":0,"structsCreated":0,"structsCreatedDataBytes":0,"ephemeralsCreated":0,"ephemeralsCreatedDataBytes":0,"valuesCreated":1,"valuesCreatedDataBytes":14,"kvSetRequests":2,"kvSetBytes":2,"inputsLocked":0,"outputsLocked":0,"fieldsCreated":0,"fieldsSet":7,"fieldsGet":2,"rGetDataCacheHits":34,"rGetDataCacheFields":0,"rGetDataCacheBytes":158963,"rGetDataNetRequests":1,"rGetDataNetFields":34,"rGetDataNetBytes":0,"kvListRequests":1,"kvListEntries":9,"kvListBytes":703,"kvGetRequests":5,"kvGetBytes":427},"error":{"txCount":0,"rootsCreated":0,"structsCreated":0,"structsCreatedDataBytes":0,"ephemeralsCreated":0,"ephemeralsCreatedDataBytes":0,"valuesCreated":0,"valuesCreatedDataBytes":0,"kvSetRequests":0,"kvSetBytes":0,"inputsLocked":0,"outputsLocked":0,"fieldsCreated":0,"fieldsSet":0,"fieldsGet":0,"rGetDataCacheHits":0,"rGetDataCacheFields":0,"rGetDataCacheBytes":0,"rGetDataNetRequests":0,"rGetDataNetFields":0,"rGetDataNetBytes":0,"kvListRequests":0,"kvListEntries":0,"kvListBytes":0,"kvGetRequests":0,"kvGetBytes":0}}
  // (1b) {"committed":{"txCount":41,"rootsCreated":0,"structsCreated":18,"structsCreatedDataBytes":487161,"ephemeralsCreated":113,"ephemeralsCreatedDataBytes":2718,"valuesCreated":111,"valuesCreatedDataBytes":574895,"kvSetRequests":32,"kvSetBytes":32,"inputsLocked":71,"outputsLocked":53,"fieldsCreated":377,"fieldsSet":441,"fieldsGet":3,"rGetDataCacheHits":180,"rGetDataCacheFields":0,"rGetDataCacheBytes":160269,"rGetDataNetRequests":127,"rGetDataNetFields":569,"rGetDataNetBytes":478364,"kvListRequests":118,"kvListEntries":284,"kvListBytes":19830,"kvGetRequests":75,"kvGetBytes":5212},"conflict":{"txCount":3,"rootsCreated":0,"structsCreated":0,"structsCreatedDataBytes":0,"ephemeralsCreated":24,"ephemeralsCreatedDataBytes":630,"valuesCreated":6,"valuesCreatedDataBytes":119,"kvSetRequests":4,"kvSetBytes":4,"inputsLocked":10,"outputsLocked":6,"fieldsCreated":26,"fieldsSet":48,"fieldsGet":2,"rGetDataCacheHits":67,"rGetDataCacheFields":0,"rGetDataCacheBytes":159215,"rGetDataNetRequests":4,"rGetDataNetFields":72,"rGetDataNetBytes":0,"kvListRequests":3,"kvListEntries":27,"kvListBytes":2109,"kvGetRequests":15,"kvGetBytes":1281},"error":{"txCount":0,"rootsCreated":0,"structsCreated":0,"structsCreatedDataBytes":0,"ephemeralsCreated":0,"ephemeralsCreatedDataBytes":0,"valuesCreated":0,"valuesCreatedDataBytes":0,"kvSetRequests":0,"kvSetBytes":0,"inputsLocked":0,"outputsLocked":0,"fieldsCreated":0,"fieldsSet":0,"fieldsGet":0,"rGetDataCacheHits":0,"rGetDataCacheFields":0,"rGetDataCacheBytes":0,"rGetDataNetRequests":0,"rGetDataNetFields":0,"rGetDataNetBytes":0,"kvListRequests":0,"kvListEntries":0,"kvListBytes":0,"kvGetRequests":0,"kvGetBytes":0}}
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
    await prj.setBlockArgs(block1Id, { numbers: [1, 2, 3] });
    await prj.setBlockArgs(block2Id, { numbers: [3, 4, 5] });
    await prj.setBlockArgs(block3Id, {
      sources: [outputRef(block1Id, "numbers"), outputRef(block2Id, "numbers")],
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

    await prj.setBlockArgs(block2Id, { numbers: [3, 4, 5], __ignored_field: "test" });

    const overviewSnapshot4 = await prj.overview.awaitStableValue();
    expect(overviewSnapshot4.blocks.find((b) => b.id === block3Id)?.stale).toEqual(false);
    expect(overviewSnapshot4.blocks.find((b) => b.id === block2Id)?.stale).toEqual(false);

    await prj.resetBlockArgsAndUiState(block2Id);
    await prj.setBlockSettings(block2Id, { versionLock: "patch" });

    const block2State = await prj.getBlockState(block2Id).getValue();
    expect(deriveDataFromStorage(block2State.blockStorage)).toStrictEqual({
      args: { numbers: [] },
      uiState: {},
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

test("reorder & rename blocks", { timeout: 20000 }, async ({ expect }) => {
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
    await prj.setBlockArgs(block1Id, { numbers: [1, 2, 3] });
    await prj.setBlockArgs(block2Id, { numbers: [3, 4, 5] });
    await prj.setBlockArgs(block3Id, {
      sources: [outputRef(block1Id, "numbers"), outputRef(block2Id, "numbers")],
    });
    await prj.runBlock(block3Id);
    await awaitBlockDone(prj, block3Id);

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

test("dependency test", { timeout: 20000 }, async ({ expect }) => {
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
    await prj.setBlockArgs(block1Id, { numbers: [1, 2, 3] });
    await prj.setBlockArgs(block2Id, { numbers: [3, 4, 5] });
    await prj.setBlockArgs(block3Id, {
      sources: [outputRef(block1Id, "numbers"), outputRef(block2Id, "numbers")],
    });
    await prj.setBlockArgs(block4Id, {
      sources: [outputRef(block1Id, "numbers"), outputRef(block2Id, "numbers")],
    });
    await prj.setBlockArgs(block5Id, {
      sources: [outputRef(block1Id, "numbers"), outputRef(block2Id, "numbers")],
    });
    const overviewSnapshot1 = await prj.overview.awaitStableValue();

    expect(overviewSnapshot1.blocks).toMatchObject([
      { upstreams: [], downstreams: [block3Id, block4Id, block5Id] },
      { upstreams: [], downstreams: [block3Id, block4Id, block5Id] },
      { upstreams: [block1Id, block2Id], downstreams: [] },
      { upstreams: [block1Id, block2Id], downstreams: [] },
      { upstreams: [block1Id, block2Id], downstreams: [] },
    ]);

    await prj.setBlockArgs(block3Id, {
      sources: [outputRef(block1Id, "numbers", true), outputRef(block2Id, "numbers", true)],
    });
    await prj.setBlockArgs(block4Id, {
      sources: [outputRef(block2Id, "numbers", true)],
    });
    await prj.setBlockArgs(block5Id, {
      sources: [outputRef(block1Id, "numbers", true)],
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

test("limbo test", async ({ expect }) => {
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

    await prj.setBlockArgs(block1Id, { numbers: [1, 2, 3] });
    await prj.setBlockArgs(block2Id, {
      sources: [outputRef(block1Id, "numbers")],
    });

    const overview1 = await prj.overview.awaitStableValue();
    overview1.blocks.forEach((block) => {
      expect(block.sections).toBeDefined();
      expect(block.canRun).toEqual(true);
      expect(block.currentBlockPack).toBeDefined();
    });

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

    await prj.setBlockArgs(block1Id, { numbers: [2, 3] });
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

test("error propagation", async ({ expect }) => {
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

    await prj.setBlockArgs(block1Id, { numbers: [1] });

    const block1StableState1 = await prj.getBlockState(block1Id).awaitStableValue();
    expect(block1StableState1.outputs!["errorIfNumberIs999"]).toStrictEqual({
      ok: true,
      value: [1],
      stable: true,
    });

    await prj.setBlockArgs(block1Id, { numbers: [999] });

    const block1StableState2 = await prj.getBlockState(block1Id).awaitStableValue();

    const result = block1StableState2.outputs!["errorIfNumberIs999"];

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Result is ok (unexpected)");
    }

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].name).toBe("WrongResourceTypeError");
  });
});

test("block duplication test", async ({ expect }) => {
  await withMl(async (ml) => {
    const prj1Id = await ml.createProject({ label: "Project 1" });
    await ml.openProject(prj1Id);
    const prj = ml.getOpenedProject(prj1Id);

    // Create original block with some configuration
    const originalBlockId = await prj.addBlock("Original Block", enterNumberSpec);
    await prj.setBlockArgs(originalBlockId, { numbers: [1, 2, 3] });
    await prj.setUiState(originalBlockId, { testUiState: "some ui data" });
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

    expect(deriveDataFromStorage(duplicatedState.blockStorage)).toEqual(
      deriveDataFromStorage(originalState.blockStorage),
    );

    // Verify they are independent - changing one shouldn't affect the other
    await prj.setBlockArgs(originalBlockId, { numbers: [4, 5, 6] });

    const originalStateAfter = await prj.getBlockState(originalBlockId).awaitStableValue();
    const duplicatedStateAfter = await prj.getBlockState(duplicatedBlockId).awaitStableValue();

    const orig = deriveDataFromStorage(originalStateAfter.blockStorage);
    const dup = deriveDataFromStorage(duplicatedStateAfter.blockStorage);

    if (!(isObject(orig) && "args" in orig)) {
      throw new Error("s1 is not an object");
    }

    if (!(isObject(dup) && "args" in dup)) {
      throw new Error("s2 is not an object");
    }

    expect(orig.args).toEqual({ numbers: [4, 5, 6] });
    expect(dup.args).toEqual({ numbers: [1, 2, 3] }); // unchanged
  });
});

test("block update test", async ({ expect }) => {
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

test("project open and close test", async ({ expect }) => {
  await withMl(async (ml) => {
    const prj1Id = await ml.createProject({ label: "Project 1" });
    await ml.openProject(prj1Id);
    let prj = ml.getOpenedProject(prj1Id);

    const blockId = await prj.addBlock("Test Block", enterNumberSpec);
    await prj.setBlockArgs(blockId, { numbers: [1, 2, 3] });
    const overview1 = await prj.overview.awaitStableValue();
    expect(overview1.blocks[0].canRun).toEqual(true);

    ml.closeProject(prj1Id);
    await ml.openProject(prj1Id);
    prj = ml.getOpenedProject(prj1Id);

    const overview2 = await prj.overview.awaitStableValue();
    expect(overview2.blocks[0].canRun).toEqual(true);
  });
});

test("block error test", async ({ expect }) => {
  await withMl(async (ml) => {
    const prj1Id = await ml.createProject({ label: "Project 1" });
    await ml.openProject(prj1Id);
    const prj = ml.getOpenedProject(prj1Id);

    expect(await prj.overview.awaitStableValue()).toMatchObject({
      meta: { label: "Project 1" },
      blocks: [],
    });

    const block3Id = await prj.addBlock("Block 3", sumNumbersSpec);

    await prj.setBlockArgs(block3Id, {
      sources: [], // empty reference list should produce an error
    });

    await prj.runBlock(block3Id);
    await awaitBlockDone(prj, block3Id);

    const overviewSnapshot1 = await prj.overview.awaitStableValue();

    overviewSnapshot1.blocks.forEach((block) => {
      expect(block.sections).toBeDefined();
    });
    expect(overviewSnapshot1.blocks[0].outputErrors).toStrictEqual(true);

    const block3StableState = await prj.getBlockState(block3Id).getValue();

    const sum = block3StableState.outputs!["sum"];
    expect(sum.ok).toStrictEqual(false);
    if (!sum.ok) {
      console.log("ml, block error test, the error:");
      console.dir(sum.errors[0], { depth: 150 });
      expect(typeof sum.errors[0] == "string" ? sum.errors[0] : sum.errors[0].message).toContain(
        "At least 1 data source must be set. It's needed in 'block error test'",
      );
    }
  });
});

blockTest(
  "should create download-file block, render it and gets outputs from its config",
  async ({ rawPrj: project, ml, expect }) => {
    const blockId = await project.addBlock("DownloadFile", downloadFileSpec);

    const inputHandle = await lsDriverGetFileHandleFromAssets(
      ml,
      expect,
      "answer_to_the_ultimate_question.txt",
    );

    // download-file is a V3 block (modelAPIVersion 2); the deprecated
    // setBlockArgs hardcodes modelAPIVersion 1 and would mismatch.
    await project.mutateBlockStorage(blockId, {
      operation: "update-block-data",
      value: { inputHandle },
    });

    await project.runBlock(blockId);

    while (true) {
      const state = (await awaitStableState(
        project.getBlockState(blockId),
        25000,
      )) as InferBlockState<typeof downloadFileModel>;
      // console.dir(state, { depth: 5 });

      const blockFrontend = await project.getBlockFrontend(blockId).awaitStableValue();
      expect(blockFrontend).toBeDefined();
      console.dir(blockFrontend, { depth: 5 });

      const outputs = state.outputs;

      if (outputs.contentAsString.ok) {
        expect(outputs.contentAsString.value).toStrictEqual("42\n");
        expect((outputs.contentAsString1 as any).value).toStrictEqual("42\n42\n");
        expect((outputs.contentAsStringRange as any).value).toStrictEqual("2");
        expect((outputs.contentAsStringRange1 as any).value).toStrictEqual("22");

        expect((outputs.contentAsJson as any).value).toStrictEqual(42);
        const localBlob = (outputs.downloadedBlobContent as any).value as LocalBlobHandleAndSize;
        const remoteBlob = (outputs.onDemandBlobContent as any).value as RemoteBlobHandleAndSize;
        const quickJsRemoteBlob = (outputs.onDemandBlobContent1 as any)
          .value as RemoteBlobHandleAndSize;

        expect(
          Buffer.from(await ml.driverKit.blobDriver.getContent(localBlob.handle)).toString("utf-8"),
        ).toEqual("42\n");

        expect(
          Buffer.from(await ml.driverKit.blobDriver.getContent(remoteBlob.handle)).toString(
            "utf-8",
          ),
        ).toEqual("42\n");

        expect(
          Buffer.from(
            await ml.driverKit.blobDriver.getContent(remoteBlob.handle, { from: 1, to: 2 }),
          ).toString("utf-8"),
        ).toEqual("2");

        expect(
          Buffer.from(
            await ml.driverKit.blobDriver.getContent(quickJsRemoteBlob.handle, { from: 1, to: 2 }),
          ).toString("utf-8"),
        ).toEqual("2");

        return;
      }
    }
  },
);

// The transfer-files coverage lives in ml-v3.test.ts only: the block is now
// V3 (modelAPIVersion 2), so it cannot be driven through this file's legacy
// setBlockArgs path.

// The blob-url-custom-protocol coverage lives in ml-v3.test.ts only: the block
// is now V3 (modelAPIVersion 2), so it cannot be driven through this file's
// legacy setBlockArgs path.

blockTest(
  "should create upload-file block, render it and upload a file to pl server",
  async ({ rawPrj: project, ml, expect }) => {
    const blockId = await project.addBlock("UpdateFile", uploadFileSpec);

    const inputHandle = await lsDriverGetFileHandleFromAssets(
      ml,
      expect,
      "another_answer_to_the_ultimate_question.txt",
    );

    // upload-file is a V3 block (modelAPIVersion 2); the deprecated
    // setBlockArgs hardcodes modelAPIVersion 1 and would mismatch.
    await project.mutateBlockStorage(blockId, {
      operation: "update-block-data",
      value: { inputHandle },
    });

    await project.runBlock(blockId);

    while (true) {
      const state = (await awaitStableState(
        project.getBlockState(blockId),
        25000,
      )) as InferBlockState<typeof uploadFileModel>;

      // console.dir(state, { depth: 5 });

      const outputs = state.outputs;
      if (outputs.handle.ok && outputs.handle.value != undefined) {
        expect(outputs.handle.value.isUpload).toBeTruthy();
        expect(outputs.handle.value.done).toBeTruthy();
        return;
      }
    }
  },
);

// The read-logs coverage lives in ml-v3.test.ts only: the block is now V3
// (modelAPIVersion 2), so it cannot be driven through this file's legacy
// setBlockArgs path.

async function lsDriverGetFileHandleFromAssets(
  ml: MiddleLayer,
  expect: any,
  fName: string,
): Promise<ImportFileHandle> {
  const storages = await ml.driverKit.lsDriver.getStorageList();

  const local = storages.find((s) => s.name == "local");
  expect(local).not.toBeUndefined();

  const fileDir = path.resolve(__dirname, "..", "..", "..", "assets");
  const files = await ml.driverKit.lsDriver.listFiles(local!.handle, fileDir);

  const ourFile = files.entries.find((f) => f.name == fName);
  expect(ourFile).not.toBeUndefined();
  expect(ourFile?.type).toBe("file");

  return (ourFile as any).handle;
}

/*
async function getImportFileHandleFromTmp(
  ml: MiddleLayer,
  fName: string,
  fileSize: number,
): Promise<ImportFileHandle> {
  const storages = await ml.driverKit.lsDriver.getStorageList();

  const local = storages.find((s) => s.name == 'local');

  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'tmp-'));
  const filePath = path.join(tmpDir, fName);

  console.log('filePath', filePath);

  const buffer = Buffer.alloc(fileSize, 0);
  fs.writeFileSync(filePath, buffer);

  const files = await ml.driverKit.lsDriver.listFiles(local!.handle, tmpDir);

  const ourFile = files.entries.find((f) => f.name == fName);

  return (ourFile as any).handle;
}
*/

function outputRef(blockId: string, name: string, requireEnrichments?: true): PlRef {
  return { __isRef: true, blockId, name, requireEnrichments };
}
