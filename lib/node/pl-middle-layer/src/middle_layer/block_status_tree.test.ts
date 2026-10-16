/**
 * The status read path against a real backend: project field to root context, synchronized tree,
 * and the fold, with the surface updating as reports land.
 *
 * The backend does not write status reports yet (no `statusApi:v1`), and the middle layer creates
 * the context itself, so the tree, its data and its KV layout are all exercisable today. Where the
 * test needs a report to exist, it writes the KV entry the backend's event processor will write,
 * which is the contract either way.
 */

import type { PlClient, SignedResourceId } from "@milaboratories/pl-client";
import {
  ContinuePolling,
  field,
  isNullSignedResourceId,
  poll,
  TestHelpers,
  toGlobalResourceId,
} from "@milaboratories/pl-client";
import { SynchronizedTreeState } from "@milaboratories/pl-tree";
import { getQuickJS } from "quickjs-emscripten";
import { expect, test } from "vitest";
import { ProjectHelper } from "../model/project_helper";
import { projectFieldName } from "../model/project_model";
import { BPSpecEnterV041NotPrepared, TestBPPreparer } from "../test/block_packs";
import { createProject, ProjectMutator } from "../mutator/project";
import { blockStatusSummary, readBlockStatusRoot } from "./block_status_tree";
import { MiddleLayer } from "./middle_layer";
import type { Project } from "./project";
import { randomUUID } from "node:crypto";
import path from "node:path";

/** A middle layer over a temporary root, closed afterwards. */
async function withMl(cb: (ml: MiddleLayer) => Promise<void>): Promise<void> {
  const workFolder = path.resolve(`work/${randomUUID()}`);
  await TestHelpers.withTempRoot(async (pl) => {
    const ml = await MiddleLayer.init(pl, workFolder, {
      defaultTreeOptions: { pollingInterval: 250, stopPollingDelay: 500 },
      devBlockUpdateRecheckInterval: 300,
      localSecret: MiddleLayer.generateLocalSecret(),
      localProjections: [],
      openFileDialogCallback: () => {
        throw new Error("Not implemented.");
      },
    });
    try {
      await cb(ml);
    } finally {
      await ml.close();
    }
  });
}

/** Waits until a block has finished its production render. */
async function awaitBlockDone(prj: Project, blockId: string, timeout: number): Promise<void> {
  const abortSignal = AbortSignal.timeout(timeout);
  while (true) {
    const overview = (await prj.overview.getValue())!;
    const block = overview.blocks.find((b) => b.id === blockId);
    if (block === undefined) throw new Error(`block not found: ${blockId}`);
    if (block.outputErrors || block.calculationStatus === "Done") return;
    await prj.overview.awaitChange(abortSignal);
  }
}

/** The root status context of a block, once the project field points at it. */
async function statusRoot(
  pl: PlClient,
  prj: SignedResourceId,
  blockId: string,
): Promise<SignedResourceId> {
  return await poll(pl, async ({ tx }) => {
    const project = await tx.getResourceData(prj, true);
    const statusField = project.fields.find(
      (f) => f.name === projectFieldName(blockId, "prodStatus"),
    );
    if (statusField === undefined || isNullSignedResourceId(statusField.value))
      throw new ContinuePolling();
    return statusField.value;
  });
}

/** Writes one transition the way the backend's event processor writes it. */
async function recordTransition(
  pl: PlClient,
  context: SignedResourceId,
  key: { topic: string; reporter: string; atMs: number },
  value: { state: string; detail?: string; reason?: string },
): Promise<void> {
  const ns = String(BigInt(key.atMs) * 1_000_000n);
  await pl.withWriteTx("RecordStatusTransition", async (tx) => {
    tx.setKValue(
      context,
      `transition/${key.topic}/${key.reporter}/${ns}`,
      JSON.stringify({
        state: value.state,
        detail: value.detail ?? "",
        reason: value.reason ?? "",
      }),
    );
    await tx.commit();
  });
}

test("the status tree of a block render folds into the summary, and follows its reports", async () => {
  const quickJs = await getQuickJS();

  await TestHelpers.withTempRoot(async (pl) => {
    const prj = await pl.withWriteTx("CreatingProject", async (tx) => {
      const prjRef = await createProject(tx);
      tx.createField(field(tx.clientRoot, "prj"), "Dynamic", prjRef);
      await tx.commit();
      return await toGlobalResourceId(prjRef);
    });

    await pl.withWriteTx("RenderBlock", async (tx) => {
      const mut = await ProjectMutator.load(new ProjectHelper(quickJs), tx, prj);
      mut.addBlock(
        { id: "block1", label: "Block1", renderingMode: "Heavy" },
        {
          storageMode: "legacy",
          legacyState: JSON.stringify({ args: { numbers: [1, 2, 3] } }),
          blockPack: await TestBPPreparer.prepare(BPSpecEnterV041NotPrepared),
        },
      );
      mut.renderProduction(["block1"], true);
      mut.save();
      await tx.commit();
    });

    // The root the watch seeds its tree at is the one the project holds.
    const root = await statusRoot(pl, prj, "block1");
    expect(await readBlockStatusRoot(pl, prj, "block1", "prod")).toEqual(root);

    const tree = await SynchronizedTreeState.init(pl, root, {
      pollingInterval: 100,
      stopPollingDelay: 2500,
      rootsNeverFinal: true,
    });

    try {
      const summary = blockStatusSummary(tree.entry());

      // Before any report: the context is there, with its data, and nothing holds the run.
      const initial = await summary.getValue();
      expect(initial.totalNodes).toBe(1);
      expect(initial.runId).toMatch(/^[0-9a-f-]{36}$/);
      expect(initial.byState).toEqual([]);
      expect(initial.line).toBeUndefined();
      expect(initial.done).toBe(false);

      // A report lands: the surface names the wait that holds the block, live.
      const at = Date.now();
      await recordTransition(
        pl,
        root,
        { topic: "workdir", reporter: "1", atMs: at },
        { state: "PopulatingWorkdir", detail: "staging 12 files" },
      );

      const populating = await poll(pl, async () => {
        await tree.refreshState();
        const current = await summary.getValue();
        if (current.line === undefined) throw new ContinuePolling();
        return current;
      });

      expect(populating.line).toMatchObject({
        state: "PopulatingWorkdir",
        phrase: "moving data into place",
        detail: "staging 12 files",
        nodes: 1,
        ofNodes: 1,
        heldSince: at,
      });
      expect(populating.liveNodes).toBe(1);
      expect(populating.startedAt).toBe(at);

      // The backend reports the render ended: the node leaves the live set and the line clears.
      await recordTransition(
        pl,
        root,
        { topic: "core", reporter: "1", atMs: at + 1000 },
        { state: "Completed" },
      );

      const completed = await poll(pl, async () => {
        await tree.refreshState();
        const current = await summary.getValue();
        if (!current.done) throw new ContinuePolling();
        return current;
      });

      expect(completed).toMatchObject({ done: true, liveNodes: 0, totalNodes: 1 });
      expect(completed.line).toBeUndefined();
      expect(completed.lastChangeAt).toBe(at + 1000);
    } finally {
      await tree.terminate();
    }
  });
});

test("a watch follows the block across runs, and closing it releases the tree", async () => {
  await withMl(async (ml) => {
    const projectId = await ml.createProject({ label: "Block status" });
    await ml.openProject(projectId);
    const prj = ml.getOpenedProject(projectId);

    const blockId = await prj.addBlock("Block 1", {
      type: "from-registry-v1",
      registryUrl: "https://block.registry.platforma.bio/releases",
      id: { organization: "milaboratory", name: "enter-numbers", version: "1.1.1" },
    });
    await prj.setBlockArgs(blockId, { numbers: [1, 2, 3] });
    await prj.runBlock(blockId);
    await awaitBlockDone(prj, blockId, 20_000);

    const summary = await prj.watchBlockStatus(blockId);

    // A second caller shares the watch rather than opening a second tree.
    expect(await prj.watchBlockStatus(blockId)).toBe(summary);

    const firstRunId = (await summary.getValue()).runId;
    expect(firstRunId).toMatch(/^[0-9a-f-]{36}$/);

    // Running the block again points the project at a new context. The caller keeps its handle:
    // the watch re-seeds itself onto the new render.
    await prj.setBlockArgs(blockId, { numbers: [4, 5, 6] });
    await prj.runBlock(blockId);
    await awaitBlockDone(prj, blockId, 20_000);

    const reseeded = await poll(ml.pl, async () => {
      const current = await summary.getValue();
      if (current.runId === undefined || current.runId === firstRunId) throw new ContinuePolling();
      return current;
    });
    expect(reseeded.runId).not.toEqual(firstRunId);

    // Closing the watch stops the tree; the project closes cleanly afterwards.
    await prj.unwatchBlockStatus(blockId);
    await prj.unwatchBlockStatus(blockId); // idempotent
    await ml.closeProject(projectId);
  });
}, 90_000);
