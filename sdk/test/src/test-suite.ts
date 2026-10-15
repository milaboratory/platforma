/*
  File-scoped harness: one backend client and one middle layer per test file, and a fresh
  project per scenario. Scenarios in one file then run concurrently on the backend while the
  per-test setup of `blockTest` is paid once.

  One project per scenario, not one project for the file: blocks in a project share a tree,
  and every change re-renders every block's outputs, so a project with many blocks is slower
  than many projects with few.
*/

import type { MiddleLayer, PlClient, ProjectId } from "@milaboratories/pl-middle-layer";
import { TestHelpers } from "@milaboratories/pl-middle-layer";
import { randomUUID } from "node:crypto";
import * as fsp from "node:fs/promises";
import path from "node:path";
import { test } from "vitest";
import type { BlockTestCtx, MiddleLayerInitOps } from "./test-block";
import { createRawHelpers, initTestMiddleLayer } from "./test-block";
import { sleep } from "./util";

/** Set `KEEP_PL_ROOT=1` to keep the backend root and work folder after the file finishes. */
const KEEP = process.env.KEEP_PL_ROOT === "1";
const CREATE_PROJECT_ATTEMPTS = 4;

export class BlockTestSession {
  private readonly projects: ProjectId[] = [];
  private creating: Promise<unknown> = Promise.resolve();

  constructor(
    readonly pl: PlClient,
    readonly ml: MiddleLayer,
    readonly tmpFolder: string,
  ) {}

  /**
   * Open a fresh project on the session's middle layer. Creations are serialized: each one
   * writes the shared project list, so concurrent creations conflict and the write
   * transaction retries until it gives up.
   */
  project(label: string): Promise<BlockTestCtx> {
    const next = this.creating.then(async () => {
      const prjId = await this.createProject(label);
      await this.ml.openProject(prjId);
      this.projects.push(prjId);
      const rawPrj = this.ml.getOpenedProject(prjId);
      return {
        rawPrj,
        ml: this.ml,
        helpers: createRawHelpers(this.ml, rawPrj),
        tmpFolder: this.tmpFolder,
      };
    });
    this.creating = next.catch(() => undefined);
    return next;
  }

  /**
   * Creation retried a few times: other test workers write the same project list through
   * their own middle layers, and under load the client gives up after its own retries.
   */
  private async createProject(label: string): Promise<ProjectId> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.ml.createProject({ label });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (attempt >= CREATE_PROJECT_ATTEMPTS || !/max number of attempts/.test(message)) throw e;
        const delay = 1000 + Math.random() * 2000;
        console.warn(
          `createProject(${label}) hit write contention (attempt ${attempt}); retrying in ${Math.round(delay)} ms`,
        );
        await sleep(delay);
      }
    }
  }

  /**
   * Close every project the session opened. Awaited before the middle layer closes: closing
   * a project drops it from the middle layer's open set before its destroy finishes, so an
   * un-awaited close outlives the shared drivers.
   */
  async closeProjects(): Promise<void> {
    const results = await Promise.allSettled(
      this.projects.splice(0).map((prjId) => this.ml.closeProject(prjId)),
    );
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0)
      throw new Error(
        `${failed.length} project(s) failed to close: ${failed.map((r) => String(r.reason)).join("; ")}`,
      );
  }
}

export async function openBlockTestSession(
  ops: Partial<MiddleLayerInitOps> = {},
): Promise<{ session: BlockTestSession; close: () => Promise<void> }> {
  const workFolder = path.resolve(`work/${randomUUID()}`);
  await fsp.mkdir(workFolder, { recursive: true });
  const alternativeRoot = `test_${Date.now()}_${randomUUID()}`;
  const pl = await TestHelpers.getTestClient(alternativeRoot);
  let ml: MiddleLayer;
  try {
    ml = await initTestMiddleLayer(pl, workFolder, ops);
  } catch (e) {
    await pl.close();
    throw e;
  }
  const session = new BlockTestSession(pl, ml, workFolder);
  // Every layer closes even when the one above it failed; the first failure is rethrown.
  const close = async () => {
    try {
      await session.closeProjects();
    } finally {
      try {
        await ml.close();
      } finally {
        await pl.close();
      }
    }
    if (KEEP) {
      console.log(`KEEP_PL_ROOT: alternative root ${alternativeRoot}, work folder ${workFolder}`);
      return;
    }
    const cleanup = await TestHelpers.getTestClient();
    try {
      await cleanup.deleteAlternativeRoot(alternativeRoot);
    } finally {
      await cleanup.close();
    }
    await fsp.rm(workFolder, { recursive: true, maxRetries: 3, retryDelay: 100 });
  };
  return { session, close };
}

/**
 * `test` with a `session` fixture shared by every test in the file. Call
 * `session.project(label)` for a project of your own in each test.
 */
export const suiteTest = test.extend<{ session: BlockTestSession }>({
  session: [
    // vitest requires the destructuring form even for a file-scoped fixture with no deps.
    // oxlint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const { session, close } = await openBlockTestSession();
      try {
        await use(session);
      } finally {
        await close();
      }
    },
    { scope: "file" },
  ],
});
