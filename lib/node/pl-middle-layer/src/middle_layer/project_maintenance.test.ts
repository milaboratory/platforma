import { ConsoleLoggerAdapter } from "@milaboratories/ts-helpers";
import { describe, expect, test } from "vitest";
import { FakeProject } from "../test/fake_project";
import type { ProjectMaintenanceState, ProjectMaintenanceWork } from "./project_maintenance";
import { projectMaintenanceState, runProjectMaintenance } from "./project_maintenance";

describe("projectMaintenanceState", () => {
  test("a project with rendered stagings and no earlier outputs is idle", async () => {
    const prj = new FakeProject();
    prj.block("a", {
      currentArgs: prj.args({}),
      currentPrerunArgs: prj.args({}),
      ...renderedStaging(prj),
    });
    prj.block("b", { currentArgs: prj.args({}) });

    expect(await projectMaintenanceState(prj.tree().entry()).getValue()).toEqual({
      blockIds: ["a", "b"],
      work: { kind: "idle" },
    });
  });

  test("a block with prerun args and no complete staging needs its staging rendered", async () => {
    const prj = new FakeProject();
    prj.block("none", { currentPrerunArgs: prj.args({}) });
    prj.block("partial", {
      currentPrerunArgs: prj.args({}),
      stagingCtx: prj.value("BContext", {}),
    });
    prj.block("noPrerun", { currentArgs: prj.args({}) });

    expect(await projectMaintenanceState(prj.tree().entry()).getValue()).toEqual({
      blockIds: ["none", "partial", "noPrerun"],
      work: { kind: "pending", stagingToRender: ["none", "partial"], previousToDrop: [] },
    });
  });

  test("earlier outputs go only once the render replacing them is ready without an error", async () => {
    const prj = new FakeProject();
    prj.block("ready", { ...production(prj, "ready"), ...previousProduction(prj) });
    prj.block("running", { ...production(prj, "running"), ...previousProduction(prj) });
    prj.block("failed", { ...production(prj, "failed"), ...previousProduction(prj) });
    prj.block("stopped", previousProduction(prj));
    prj.block("staging", {
      currentPrerunArgs: prj.args({}),
      ...renderedStaging(prj),
      stagingCtxPrevious: prj.value("BContext", {}),
      stagingUiCtxPrevious: prj.value("BContext", {}),
      stagingOutputPrevious: prj.value("json/object", {}),
    });

    expect(await projectMaintenanceState(prj.tree().entry()).getValue()).toEqual({
      blockIds: ["ready", "running", "failed", "stopped", "staging"],
      work: { kind: "pending", stagingToRender: [], previousToDrop: ["ready", "staging"] },
    });
  });
});

describe("runProjectMaintenance", () => {
  test("an idle project runs no pass and waits for a change", async () => {
    const run = fakeMaintenance([idle(["a"])]);
    await run.finished;
    expect(run.passes).toBe(0);
    expect(run.waits).toBe(1);
  });

  test("a pass runs while work is pending, until the project is idle", async () => {
    const run = fakeMaintenance([
      staging(["a", "b"], ["a", "b"]),
      staging(["a", "b"], ["b"]),
      idle(["a", "b"]),
    ]);
    await run.finished;
    expect(run.passes).toBe(2);
    expect(run.waits).toBe(1);
  });

  test("a pass that makes no progress is not repeated until the work changes", async () => {
    const stuck = staging(["a", "b"], ["a"]);
    const run = fakeMaintenance([
      stuck,
      stuck,
      // the tree moved somewhere the work does not depend on
      stuck,
      staging(["a", "b"], ["a", "b"]),
      stuck,
      stuck,
    ]);
    await run.finished;
    expect(run.passes).toBe(3);
    expect(run.waits).toBe(3);
  });

  test("blocks that leave the project are reported once", async () => {
    const run = fakeMaintenance([idle(["a", "b", "c"]), idle(["a", "c"]), idle(["a", "c"])]);
    await run.finished;
    expect(run.deleted).toEqual([["b"]]);
  });

  test("a pass that failed is retried, not taken for one that made no progress", async () => {
    const work = staging(["a"], ["a"]);
    const run = fakeMaintenance([work, work, idle(["a"])], { failFirstPass: true });
    await run.finished;
    expect(run.passes).toBe(2);
  });

  test("a deleted project ends maintenance", async () => {
    const notFound = Object.assign(new Error("not found"), { name: "RpcError", code: "NOT_FOUND" });
    const run = fakeMaintenance([idle(["a"])], { failFirstRead: notFound });
    await run.finished;
    expect(run.reads).toBe(1);
  });
});

// Internals

type FakeRun = {
  readonly finished: Promise<void>;
  readonly passes: number;
  readonly waits: number;
  readonly reads: number;
  readonly deleted: readonly (readonly string[])[];
};

/** Runs maintenance over a scripted sequence of readings; it ends after the last one. */
function fakeMaintenance(
  readings: readonly ProjectMaintenanceState[],
  ops: { readonly failFirstRead?: Error; readonly failFirstPass?: boolean } = {},
): FakeRun {
  const abort = new AbortController();
  const counts = { passes: 0, waits: 0, reads: 0 };
  const deleted: (readonly string[])[] = [];
  let next = 0;

  const advance = () => {
    if (next >= readings.length - 1) abort.abort();
    else next++;
  };

  const finished = runProjectMaintenance({
    readState: () => {
      counts.reads++;
      if (counts.reads === 1 && ops.failFirstRead !== undefined)
        return Promise.reject(ops.failFirstRead);
      const reading = readings[next];
      if (reading === undefined) return Promise.reject(new Error("no reading"));
      return Promise.resolve(reading);
    },
    awaitStateChange: () => {
      counts.waits++;
      advance();
      return Promise.resolve();
    },
    runPass: () => {
      counts.passes++;
      if (counts.passes === 1 && ops.failFirstPass === true)
        return Promise.reject(new Error("transaction failed"));
      advance();
      return Promise.resolve();
    },
    onBlocksDeleted: (ids) => deleted.push(ids),
    signal: abort.signal,
    logger: new ConsoleLoggerAdapter(),
  });

  return {
    finished,
    get passes() {
      return counts.passes;
    },
    get waits() {
      return counts.waits;
    },
    get reads() {
      return counts.reads;
    },
    deleted,
  };
}

function idle(blockIds: string[]): ProjectMaintenanceState {
  return { blockIds, work: { kind: "idle" } };
}

function staging(blockIds: string[], stagingToRender: string[]): ProjectMaintenanceState {
  const work: ProjectMaintenanceWork = { kind: "pending", stagingToRender, previousToDrop: [] };
  return { blockIds, work };
}

function renderedStaging(prj: FakeProject) {
  return {
    stagingCtx: prj.value("BContext", {}),
    stagingUiCtx: prj.value("BContext", {}),
    stagingOutput: prj.value("json/object", {}),
  };
}

function production(prj: FakeProject, state: "ready" | "running" | "failed") {
  const ctx =
    state === "ready"
      ? prj.value("BContext", {})
      : state === "running"
        ? prj.notReady("BContext")
        : prj.error("run failed");
  return {
    prodArgs: prj.args({}),
    prodCtx: state === "failed" ? { error: ctx } : ctx,
    prodUiCtx: prj.value("BContext", {}),
    prodOutput: prj.value("json/object", {}),
  };
}

function previousProduction(prj: FakeProject) {
  return {
    prodCtxPrevious: prj.value("BContext", {}),
    prodUiCtxPrevious: prj.value("BContext", {}),
    prodOutputPrevious: prj.value("json/object", {}),
  };
}
