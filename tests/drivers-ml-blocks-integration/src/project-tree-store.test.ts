import { promises as fs } from "node:fs";
import path from "node:path";
import { test, expect } from "vitest";
import { BlockPointer as enterNumberSpec } from "@milaboratories/milaboratories.test-enter-numbers-v3";
import { withMl } from "./with-ml";

/**
 * End-to-end check that the persistent project tree store survives a close/re-open cycle and
 * that the tree it hydrates is still correct.
 *
 * Scope note: this asserts the *mechanism* — that block packs are persisted and replayed, and
 * that a re-opened project built on top of replayed resources is sound. It does not assert a
 * byte saving. The saving follows from `constructTreeLoadingRequest`, which reports everything
 * already in the heap as `finalResources` so the backend skips it, and its size from the tree
 * census in tasks/MILAB-6653/COLD-OPEN.md §2.2 (block packs are 63–90 % of a project's bytes).
 *
 * The store is opt-in via `MI_PROJECT_TREE_CACHE`; set here for this test only, so both arms run
 * in one process against one backend instead of being compared across runs.
 */
async function storeFiles(workFolder: string): Promise<string[]> {
  const cacheDir = path.join(workFolder, "treeCache");
  return await fs.readdir(cacheDir).catch(() => [] as string[]);
}

test("project tree store replays block packs across a re-open", async () => {
  const previous = process.env.MI_PROJECT_TREE_CACHE;
  process.env.MI_PROJECT_TREE_CACHE = "1";
  try {
    await withMl(async (ml, workFolder) => {
      const projectId = await ml.createProject({ label: "tree store" });

      await ml.openProject(projectId);
      const project = ml.getOpenedProject(projectId);
      await project.addBlock("Block 1", enterNumberSpec);
      // The block pack has to be in the tree before the store is written.
      await project.overview.awaitStableValue();
      await ml.closeProject(projectId);

      const files = await storeFiles(workFolder);
      expect(files).toHaveLength(1);

      const stored = JSON.parse(
        await fs.readFile(path.join(workFolder, "treeCache", files[0]), "utf-8"),
      ) as { version: number; roots: string[]; resources: { type: { name: string } }[] };
      expect(stored.version).toBe(1);
      expect(stored.roots).toHaveLength(1);
      // Signature included — a re-minted signature must invalidate the file rather than be
      // replayed as if still valid.
      expect(stored.roots[0]).toContain("|");
      expect(stored.resources.length).toBeGreaterThan(0);
      expect(stored.resources.some((r) => r.type.name === "BlockPackCustom")).toBe(true);

      // Re-open on top of the replayed resources: the project must still resolve normally.
      await ml.openProject(projectId);
      const reopened = await ml.getOpenedProject(projectId).overview.awaitStableValue();
      expect(reopened.blocks).toHaveLength(1);
      await ml.closeProject(projectId);

      // And with the store deleted, a cold load still works — the fallback path.
      await fs.rm(path.join(workFolder, "treeCache"), { recursive: true, force: true });
      await ml.openProject(projectId);
      const cold = await ml.getOpenedProject(projectId).overview.awaitStableValue();
      expect(cold.blocks).toHaveLength(1);
      await ml.closeProject(projectId);
    });
  } finally {
    if (previous === undefined) delete process.env.MI_PROJECT_TREE_CACHE;
    else process.env.MI_PROJECT_TREE_CACHE = previous;
  }
}, 180_000);
