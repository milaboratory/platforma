import { describe, expect, test } from "vitest";
import { TestHelpers } from "@milaboratories/pl-client";
import { randomUUID } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import * as tp from "node:timers/promises";
import { MiddleLayer } from "./middle_layer";
import type { ProjectId } from "../model/project_model";
import type { TreeSnapshotOps } from "./ops";

/**
 * The acceptance scenarios that need a live backend. Each one runs several middle layers in
 * turn against one backend root and one work folder, which is what makes a reopen a reopen:
 * the projects are the same projects and the snapshot directory is the same directory.
 *
 * `MiddleLayer.close()` closes the client it was given, so every middle layer here gets its
 * own client. They share a session, because the test client reuses one cached token, and a
 * shared session is exactly what a warm reopen needs.
 */

const WORK_ROOT = path.resolve(import.meta.dirname, "..", "..", "work");

/** Short intervals so the periodic write is observable inside a test rather than in five
 *  minutes. Everything else is left at its default. */
function fastSnapshots(overrides: Partial<TreeSnapshotOps> = {}): TreeSnapshotOps {
  return {
    enabled: true,
    writeInterval: 250,
    maxSizeBytes: 256 * 1024 * 1024,
    ...overrides,
  };
}

type Scenario = {
  /** Opens another middle layer, on its own client, over the same root and work folder. */
  open: (treeSnapshotOps?: TreeSnapshotOps) => Promise<MiddleLayer>;
  /** Closes one, so it is not closed twice during cleanup. */
  close: (ml: MiddleLayer) => Promise<void>;
  /** Creates a project, opens it, and lets its tree settle so there is a mirror worth writing.
   *  Tracked for cleanup. */
  project: (ml: MiddleLayer, label: string) => Promise<ProjectId>;
  /** The shared snapshot directory. */
  snapshotDir: string;
};

/**
 * Each middle layer gets its own client, because `MiddleLayer.close()` closes the client it
 * was given, and a reopen has to survive that.
 *
 * The clients use the caller's own root rather than a temporary one: `PlClient.init` with an
 * `alternativeRoot` name always creates a fresh ephemeral root and overwrites the field, so a
 * second client asking for the same name gets an empty project list, which is precisely the
 * state a reopen must not start from. The projects created here are deleted afterwards.
 */
async function withScenario(body: (scenario: Scenario) => Promise<void>): Promise<void> {
  const workFolder = path.resolve(WORK_ROOT, randomUUID());
  const live = new Set<MiddleLayer>();
  const projects = new Set<ProjectId>();

  const openMl = async (treeSnapshotOps: TreeSnapshotOps) => {
    const client = await TestHelpers.getTestClient();
    const ml = await MiddleLayer.init(client, workFolder, {
      defaultTreeOptions: { pollingInterval: 250, stopPollingDelay: 500 },
      devBlockUpdateRecheckInterval: 300,
      projectRefreshInterval: 250,
      localSecret: MiddleLayer.generateLocalSecret(),
      localProjections: [],
      openFileDialogCallback: () => {
        throw new Error("Not implemented.");
      },
      treeSnapshotOps,
    });
    live.add(ml);
    return ml;
  };

  const scenario: Scenario = {
    snapshotDir: path.join(workFolder, "treeSnapshots"),
    open: async (treeSnapshotOps = fastSnapshots()) => await openMl(treeSnapshotOps),
    close: async (ml: MiddleLayer) => {
      live.delete(ml);
      await ml.close();
    },
    project: async (ml: MiddleLayer, label: string) => {
      const id = await ml.createProject({ label: `${label} ${randomUUID()}` });
      projects.add(id);
      await ml.openProject(id);
      // Reading the overview forces the tree to load and the computables to resolve.
      await ml.getOpenedProject(id).overview.awaitStableValue();
      return id;
    },
  };

  try {
    await body(scenario);
  } finally {
    for (const ml of live) await ml.close().catch(() => {});

    // The root outlives the test, so the projects have to be cleaned up explicitly.
    if (projects.size > 0) {
      const cleanup = await openMl({ ...fastSnapshots(), enabled: false });
      try {
        for (const id of projects) await cleanup.deleteProject(id).catch(() => {});
      } finally {
        await cleanup.close().catch(() => {});
      }
    }
    await fsp.rm(workFolder, { recursive: true, force: true });
  }
}

async function snapshotFiles(dir: string): Promise<string[]> {
  try {
    return (await fsp.readdir(dir)).sort();
  } catch {
    return [];
  }
}

describe("reopening a project", () => {
  test("the close write makes the next open warm", async () => {
    await withScenario(async ({ open, close, project, snapshotDir }) => {
      const first = await open();
      const id = await project(first, "warm reopen");
      await first.closeProject(id);

      // One file for the one project, written at the close boundary.
      expect(await snapshotFiles(snapshotDir)).toHaveLength(1);
      expect(first.treeSnapshotStats?.writes).toBeGreaterThanOrEqual(1);
      await close(first);

      const second = await open();
      await second.openProject(id);
      // The claim: the reopen read the snapshot and restored from it.
      expect(second.treeSnapshotStats?.hits).toBe(1);
      expect(second.treeSnapshotStats?.misses.absent).toBe(0);
      // Read is not enough: this is the tree actually accepting the mirror.
      expect(second.treeSnapshotStats?.restores).toBe(1);

      // And the project is genuinely usable, not merely restored.
      const overview = await second.getOpenedProject(id).overview.awaitStableValue();
      expect(overview.meta.label).toContain("warm reopen");
      await close(second);
    });
  });

  test("project switching: both returns hit", async () => {
    await withScenario(async ({ open, close, project, snapshotDir }) => {
      const first = await open();
      const a = await project(first, "A");
      const b = await project(first, "B");
      await first.closeProject(a);
      await first.closeProject(b);
      expect(await snapshotFiles(snapshotDir)).toHaveLength(2);
      await close(first);

      const second = await open();
      await second.openProject(a);
      await second.openProject(b);
      expect(second.treeSnapshotStats?.hits).toBe(2);
      expect(second.treeSnapshotStats?.restores).toBe(2);
      await close(second);
    });
  });

  test("a killed process is covered by the periodic write", async () => {
    await withScenario(async ({ open, close, project, snapshotDir }) => {
      const first = await open(fastSnapshots({ writeInterval: 250 }));
      const id = await project(first, "killed");

      // Never closed, standing in for a reboot, a lost connection or a kill. The periodic
      // write on the maintenance loop is the only thing that can have saved this.
      //
      // What this does NOT reproduce is the relaunch: both middle layers here share a session,
      // because the test client reuses one cached token. In production the equivalent is the
      // desktop app reconnecting with the JWT it persisted, which keeps the session and so the
      // signatures; a change that made relaunch re-login instead would break the warm reopen
      // and no assertion here would notice.
      await tp.setTimeout(1500);
      expect(first.treeSnapshotStats?.writes).toBeGreaterThanOrEqual(1);
      expect(await snapshotFiles(snapshotDir)).toHaveLength(1);

      // Closing the middle layer without closing the project: close() must not snapshot, so
      // whatever is on disk came from the periodic write.
      const writesBefore = first.treeSnapshotStats!.writes;
      await close(first);
      expect(first.treeSnapshotStats?.writes).toBe(writesBefore);

      const second = await open();
      await second.openProject(id);
      expect(second.treeSnapshotStats?.hits).toBe(1);
      expect(second.treeSnapshotStats?.restores).toBe(1);
      await close(second);
    });
  });
});

describe("write cadence", () => {
  test("open and idle writes once, then goes quiet", async () => {
    await withScenario(async ({ open, close, project }) => {
      const ml = await open(fastSnapshots({ writeInterval: 250 }));
      await project(ml, "idle");

      // Several intervals of nothing happening.
      await tp.setTimeout(2000);

      // Exactly one, not "at most one": a cold open loads a tree, so the change gate is open
      // and the first maintenance pass writes. Asserting <= 1 would pass with zero writes and
      // prove nothing about the periodic trigger existing at all.
      expect(ml.treeSnapshotStats?.writes).toBe(1);

      // And then quiet, because the gate closes on a mirror that has not moved.
      await tp.setTimeout(1500);
      expect(ml.treeSnapshotStats?.writes).toBe(1);
      await close(ml);
    });
  });

  test("a project that keeps changing writes at most once per interval", async () => {
    await withScenario(async ({ open, close, project }) => {
      const ml = await open(fastSnapshots({ writeInterval: 1000 }));
      const id = await project(ml, "changing");

      // Keep the tree moving for roughly three intervals.
      const until = Date.now() + 3000;
      let n = 0;
      while (Date.now() < until) {
        await ml.setProjectMeta(id, { label: `changing ${n++}` });
        await tp.setTimeout(150);
      }

      // Bounded by wall clock, not by how often the tree changed.
      expect(ml.treeSnapshotStats!.writes).toBeLessThanOrEqual(4);
      expect(n).toBeGreaterThan(4);
      await close(ml);
    });
  });
});

describe("when the snapshot cannot be used", () => {
  test("a rotated signature is a miss, the file is kept, and the project still opens", async () => {
    await withScenario(async ({ open, close, project, snapshotDir }) => {
      const first = await open();
      const id = await project(first, "rotated");
      await first.closeProject(id);
      await close(first);

      // Rewrite the witness in the header to stand in for a session that has ended. Its
      // offset is fixed: magic (4) + schema (2) + flags (2), then a u16 length and the bytes.
      const [name] = await snapshotFiles(snapshotDir);
      const file = path.join(snapshotDir, name);
      const bytes = await fsp.readFile(file);
      const witnessLength = bytes.readUInt16LE(8);
      expect(witnessLength).toBeGreaterThan(0);
      bytes[10] = bytes[10] ^ 0xff;
      await fsp.writeFile(file, bytes);

      const second = await open();
      await second.openProject(id);
      expect(second.treeSnapshotStats?.hits).toBe(0);
      expect(second.treeSnapshotStats?.restores).toBe(0);
      expect(second.treeSnapshotStats?.misses["session-rotated"]).toBe(1);

      // Kept: the bodies are still good, only the signatures died.
      expect(await snapshotFiles(snapshotDir)).toHaveLength(1);

      const overview = await second.getOpenedProject(id).overview.awaitStableValue();
      expect(overview.meta.label).toContain("rotated");
      await close(second);
    });
  });

  test("a truncated snapshot opens cold without raising", async () => {
    await withScenario(async ({ open, close, project, snapshotDir }) => {
      const first = await open();
      const id = await project(first, "poisoned");
      await first.closeProject(id);
      await close(first);

      const [name] = await snapshotFiles(snapshotDir);
      const file = path.join(snapshotDir, name);
      const bytes = await fsp.readFile(file);
      await fsp.writeFile(file, bytes.subarray(0, Math.floor(bytes.length / 2)));

      const second = await open();
      await second.openProject(id);
      expect(second.treeSnapshotStats?.hits).toBe(0);
      expect(second.treeSnapshotStats?.restores).toBe(0);

      const overview = await second.getOpenedProject(id).overview.awaitStableValue();
      expect(overview.meta.label).toContain("poisoned");
      await close(second);
    });
  });
});

describe("the kill switch", () => {
  test("nothing is read or written when snapshots are off", async () => {
    await withScenario(async ({ open, close, project, snapshotDir }) => {
      const first = await open(fastSnapshots({ enabled: false }));
      const id = await project(first, "disabled");
      await tp.setTimeout(1000);
      await first.closeProject(id);

      expect(first.treeSnapshotStats).toBeUndefined();
      expect(await snapshotFiles(snapshotDir)).toStrictEqual([]);
      await close(first);

      // And a project created while off still opens once it is back on.
      const second = await open();
      await second.openProject(id);
      expect(second.treeSnapshotStats?.misses.absent).toBe(1);
      await close(second);
    });
  });
});
