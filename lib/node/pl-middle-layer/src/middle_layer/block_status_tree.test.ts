/**
 * The status read path against a real backend: an action-context tree in the backend, a
 * synchronized tree over it, and the fold, with the surface following reports as they land.
 *
 * The tests build the contexts themselves, the way the middle layer and the workflow SDK do: an
 * ActionContext resource carrying baggage, children in Dynamic `child/...` fields, reports as KV
 * entries under the reporters' key layout. That keeps them independent of whether this backend
 * takes the render's `actionContext` link, which only decides whether the middle layer creates the
 * root itself.
 */

import type {
  AnyResourceRef,
  PlClient,
  PlTransaction,
  ResourceRef,
} from "@milaboratories/pl-client";
import {
  ContinuePolling,
  field,
  poll,
  TestHelpers,
  toGlobalResourceId,
} from "@milaboratories/pl-client";
import { SynchronizedTreeState } from "@milaboratories/pl-tree";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { expect, test } from "vitest";
import { projectFieldName } from "../model/project_model";
import { ActionContextType } from "../mutator/template/render_block";
import { blockStatusSummary, readBlockActionContextRoot } from "./block_status_tree";
import { MiddleLayer } from "./middle_layer";
import type { Project } from "./project";

// ── Building a tree ──────────────────────────────────────────────────────────

/** Creates an action context, linked under `parent` when given. */
function createContext(tx: PlTransaction, name: string, parent?: AnyResourceRef): ResourceRef {
  const ctx = tx.createEphemeral(
    ActionContextType,
    JSON.stringify({ name, "block-id": "block1", "run-id": randomUUID() }),
  );
  if (parent !== undefined) {
    const child = field(parent, `child/${name}`);
    tx.createField(child, "Dynamic");
    tx.setField(child, ctx);
  }
  return ctx;
}

/** Writes one transition the way a reporter writes it. */
function record(
  tx: PlTransaction,
  ctx: AnyResourceRef,
  namespace: string,
  reporter: string,
  atMs: number,
  state: string,
  detail = "",
): void {
  const ns = String(BigInt(atMs) * 1_000_000n);
  tx.setKValue(
    ctx,
    `transition/${namespace}/${reporter}/${ns}`,
    JSON.stringify({ state, detail, reason: "" }),
  );
}

// ── The fold over a real tree ────────────────────────────────────────────────

test("a real action-context tree folds into the summary and follows its reports", async () => {
  await TestHelpers.withTempRoot(async (pl) => {
    const ids = await pl.withWriteTx("BuildTree", async (tx) => {
      const root = createContext(tx, "root");
      const children = ["a", "b", "c"].map((n) => createContext(tx, n, root));
      tx.createField(field(tx.clientRoot, "statusRoot"), "Dynamic", root);
      await tx.commit();
      return {
        root: await toGlobalResourceId(root),
        children: await Promise.all(children.map((c) => toGlobalResourceId(c))),
      };
    });

    const tree = await SynchronizedTreeState.init(pl, ids.root, {
      pollingInterval: 100,
      stopPollingDelay: 2500,
      rootsNeverFinal: true,
    });
    try {
      const summary = blockStatusSummary(tree.entry(), true, (err) => {
        throw err;
      });
      const settled = async (until: (s: Awaited<ReturnType<typeof summary.getValue>>) => boolean) =>
        await poll(pl, async () => {
          await tree.refreshState();
          const current = await summary.getValue();
          if (!until(current)) throw new ContinuePolling();
          return current;
        });

      // Four contexts, nothing reported yet: all live, no state named.
      const initial = await settled((s) => s.totalNodes === 4);
      expect(initial).toMatchObject({ liveNodes: 4, byState: [], done: false });

      // Two children wait for a machine, one stages files.
      const at = Date.now();
      await pl.withWriteTx("Report", async (tx) => {
        record(tx, ids.children[0], "exec", "1", at, "WaitingForMachine");
        record(tx, ids.children[1], "exec", "2", at + 1, "WaitingForMachine");
        record(tx, ids.children[2], "workdir", "3", at + 2, "PopulatingWorkdir", "12 files");
        await tx.commit();
      });
      const waiting = await settled((s) => s.byState.length === 2);
      expect(waiting.byState.map((g) => [g.phrase, g.nodes])).toEqual([
        ["waiting for a machine", 2],
        ["staging input files", 1],
      ]);
      expect(waiting.line).toMatchObject({ state: "WaitingForMachine", nodes: 2, ofNodes: 4 });

      // Every render reports its own end: the run is done.
      await pl.withWriteTx("Finish", async (tx) => {
        for (const [i, ctx] of [ids.root, ...ids.children].entries())
          record(tx, ctx, "render", String(10 + i), at + 1000, "Completed");
        record(tx, ids.children[0], "exec", "1", at + 900, "Completed");
        record(tx, ids.children[1], "exec", "2", at + 900, "Completed");
        record(tx, ids.children[2], "workdir", "3", at + 900, "Completed");
        await tx.commit();
      });
      const finished = await settled((s) => s.done);
      expect(finished).toMatchObject({ liveNodes: 0, totalNodes: 4, done: true });
      expect(finished.line).toBeUndefined();
    } finally {
      await tree.terminate();
    }
  });
});

// ── The watch, through the Project API ───────────────────────────────────────

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

/** A project with one block run to completion. */
async function projectWithBlock(ml: MiddleLayer): Promise<{ prj: Project; blockId: string }> {
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
  await awaitBlockDone(prj, blockId, 30_000);
  return { prj, blockId };
}

/**
 * Points the block's prodActionContext at a new context, as a render does, and touches the project
 * so its tree's change generation moves: the field itself is pruned from that tree, and a real
 * render changes other project fields in the same transaction.
 */
async function plantRoot(pl: PlClient, prj: Project, blockId: string): Promise<string> {
  const runId = randomUUID();
  await pl.withWriteTx("PlantRoot", async (tx) => {
    const ctx = tx.createEphemeral(
      ActionContextType,
      JSON.stringify({ name: "Block 1", "block-id": blockId, "run-id": runId }),
    );
    const f = field(prj.rid, projectFieldName(blockId, "prodActionContext"));
    tx.createField(f, "Dynamic");
    tx.setField(f, ctx);
    tx.setKValue(prj.rid, "test/blockStatusBump", runId);
    await tx.commit();
  });
  return runId;
}

/** The root the middle layer would seed at, read through the project. */
async function rootOf(pl: PlClient, prj: Project, blockId: string) {
  return await readBlockActionContextRoot(pl, prj.rid, blockId, "prod");
}

test("a watch follows the block's context and is shared between holders", async () => {
  await withMl(async (ml) => {
    const { prj, blockId } = await projectWithBlock(ml);
    const run1 = await plantRoot(ml.pl, prj, blockId);
    expect(await rootOf(ml.pl, prj, blockId)).toBeDefined();

    const first = await prj.watchBlockStatus(blockId);
    const second = await prj.watchBlockStatus(blockId);
    expect(second).toBe(first);
    expect((await first.getValue()).runId).toBe(run1);

    // A new context for the block: the watch re-seeds itself, the handle stays the same.
    const run2 = await plantRoot(ml.pl, prj, blockId);
    const reseeded = await poll(ml.pl, async () => {
      const current = await first.getValue();
      if (current.runId !== run2) throw new ContinuePolling();
      return current;
    });
    expect(reseeded.runId).toBe(run2);

    // One holder letting go keeps the tree for the other; the last one releases it.
    await prj.unwatchBlockStatus(blockId);
    expect((await second.getValue()).runId).toBe(run2);
    await prj.unwatchBlockStatus(blockId);
    expect((await second.getValue()).runId).toBeUndefined();
    await prj.unwatchBlockStatus(blockId); // idempotent once nothing holds it
  });
}, 120_000);

test("closing the project terminates its watches and refuses new ones", async () => {
  await withMl(async (ml) => {
    const { prj, blockId } = await projectWithBlock(ml);
    const run = await plantRoot(ml.pl, prj, blockId);

    const summary = await prj.watchBlockStatus(blockId);
    expect((await summary.getValue()).runId).toBe(run);

    await ml.closeProject(prj.id);
    expect((await summary.getValue()).runId).toBeUndefined();
    await expect(prj.watchBlockStatus(blockId)).rejects.toThrow(/project is closed/);
  });
}, 120_000);
