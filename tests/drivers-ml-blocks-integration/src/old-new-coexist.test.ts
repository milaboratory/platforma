// An OLD published version of a block (pnpm-aliased from the registry) and the
// NEW workspace-source version of the SAME block coexist in one project, each
// consumed via its own standard `BlockPointer` (from-pack-v2). Proves the
// testing-framework migration mechanism (A-0094) and the Q-0006 question that a
// single project can hold a registry-pinned and a workspace-source instance of
// the same block at once.
//
// OLD: `npm:@milaboratories/milaboratories.test-enter-numbers@1.1.0` aliased as
//      `...test-enter-numbers-old` — installed from the registry as a from-pack-v2
//      pack (node_modules/.pnpm/...).
// NEW: `@milaboratories/milaboratories.test-enter-numbers` — the workspace block.
import { BlockPointer as enterNumbersNew } from "@milaboratories/milaboratories.test-enter-numbers";
import { BlockPointer as enterNumbersOld } from "@milaboratories/milaboratories.test-enter-numbers-old";
import { BlockPointer as sumNumbersSpec } from "@milaboratories/milaboratories.test-sum-numbers";
import { test } from "vitest";
import { withMl } from "./with-ml";
import { awaitBlockDone, createProjectWatcher, outputRef } from "./test-helpers";
import { BlockDumpArraySchemaUnified } from "./unified-state-schema";

test(
  "old (registry-aliased) + new (workspace) enter-numbers coexist",
  { timeout: 30_000 },
  async ({ expect }) => {
    // Both pointers are from-pack-v2, but resolve to physically distinct packs:
    // OLD from the registry tarball, NEW from the workspace checkout.
    expect(enterNumbersOld.type).toBe("from-pack-v2");
    expect(enterNumbersNew.type).toBe("from-pack-v2");
    expect(enterNumbersOld.packUrl).not.toEqual(enterNumbersNew.packUrl);
    expect(enterNumbersOld.packUrl).toContain(".pnpm");

    await withMl(async (ml, workFolder) => {
      const prjId = await ml.createProject({ label: "old+new coexist" });
      await ml.openProject(prjId);
      const prj = ml.getOpenedProject(prjId);

      const oldId = await prj.addBlock("Enter (old, registry)", enterNumbersOld);
      const newId = await prj.addBlock("Enter (new, workspace)", enterNumbersNew);
      const sumId = await prj.addBlock("Sum", sumNumbersSpec);

      const projectWatcher = await createProjectWatcher(ml, prj, {
        workFolder,
        validator: BlockDumpArraySchemaUnified,
      });

      // Three blocks coexist in one project — including two instances of the same
      // block resolved from different sources (registry OLD + workspace NEW).
      const overview0 = await prj.overview.awaitStableValue();
      expect(overview0.blocks.length).toBe(3);
      for (const block of overview0.blocks) {
        expect(block.currentBlockPack).toBeDefined();
      }

      await prj.setBlockArgs(oldId, { numbers: [1, 2, 3] });
      await prj.setBlockArgs(newId, { numbers: [10, 20] });
      // Sum consumes the OLD (registry-aliased) block's output, so a green run
      // proves the aliased OLD pack actually executes against the backend.
      await prj.setBlockArgs(sumId, { sources: [outputRef(oldId, "numbers")] });

      const overview1 = await prj.overview.awaitStableValue();
      const findBlock = (id: string) => overview1.blocks.find((b) => b.id === id);
      expect(findBlock(oldId)?.canRun).toBe(true);
      expect(findBlock(newId)?.canRun).toBe(true);
      expect(findBlock(sumId)?.canRun).toBe(true);

      await prj.runBlock(sumId);
      await awaitBlockDone(prj, sumId);

      const sumState = await prj.getBlockState(sumId).getValue();
      expect(sumState.outputs!["sum"]).toStrictEqual({
        ok: true,
        value: 6, // sum of the OLD block's [1, 2, 3]
        stable: true,
      });

      await projectWatcher.abort();
    });
  },
);
