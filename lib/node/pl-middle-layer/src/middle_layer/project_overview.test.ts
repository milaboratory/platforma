import { Computable } from "@milaboratories/computable";
import type { RunIssue } from "@milaboratories/pl-model-common";
import type { PlTreeState } from "@milaboratories/pl-tree";
import { describe, expect, test } from "vitest";
import { projectFieldName } from "../model/project_model";
import { FakeProject } from "../test/fake_project";
import { argsAllowRun, type RunStateSource, withRunState } from "./project_overview";

const setThreshold: RunIssue = { severity: "error", message: "Set a threshold" };

describe("argsAllowRun", () => {
  test("a block whose runIssues found no errors in its current args may run", async () => {
    const prj = new FakeProject();
    prj.block("x", { currentArgs: prj.args({ n: 1 }), inputsValid: prj.runErrors([], { n: 1 }) });

    expect(await allowRun(prj.tree(), "x")).toBe(true);
  });

  test("a block with current args and no run errors record may not run", async () => {
    // What a project saved by an older middle layer holds: current args and no `inputsValid`.
    const prj = new FakeProject();
    prj.block("x", { currentArgs: prj.args({ n: 1 }) });

    expect(await allowRun(prj.tree(), "x")).toBe(false);
  });

  test("a block without current args may not run", async () => {
    const prj = new FakeProject();
    prj.block("x", { prodArgs: prj.args({ n: 1 }) });

    expect(await allowRun(prj.tree(), "x")).toBe(false);
  });

  test("a block whose runIssues found errors in its current args may not run", async () => {
    const prj = new FakeProject();
    prj.block("x", {
      currentArgs: prj.args({ n: 1 }),
      inputsValid: prj.runErrors([setThreshold], { n: 1 }),
    });

    expect(await allowRun(prj.tree(), "x")).toBe(false);
  });

  test("errors found in the same args, whatever their key order, still apply", async () => {
    const prj = new FakeProject();
    prj.block("x", {
      currentArgs: prj.args({ a: 1, b: { c: 2, d: 3 } }),
      inputsValid: prj.runErrors([setThreshold], { b: { d: 3, c: 2 }, a: 1 }),
    });

    expect(await allowRun(prj.tree(), "x")).toBe(false);
  });

  test("a record written for other args keeps the block from running", async () => {
    // What an older middle layer leaves behind: it writes new current args and never touches
    // the `inputsValid` field.
    const prj = new FakeProject();
    prj.block("x", {
      currentArgs: prj.args({ n: 2 }),
      inputsValid: prj.runErrors([], { n: 1 }),
    });

    expect(await allowRun(prj.tree(), "x")).toBe(false);
  });

  test("a field that cannot be read keeps the block from running", async () => {
    const prj = new FakeProject();
    prj.block("x", {
      currentArgs: prj.args({ n: 1 }),
      inputsValid: prj.value("json/object", [setThreshold]),
    });

    expect(await allowRun(prj.tree(), "x")).toBe(false);
  });

  test("may run again once the args and their record have no errors", async () => {
    const prj = new FakeProject();
    prj.block("x", {
      currentArgs: prj.args({ n: 1 }),
      inputsValid: prj.runErrors([setThreshold], { n: 1 }),
    });
    const tree = prj.tree();
    const computable = allowRunComputable(tree, "x");
    expect(await computable.getValue()).toBe(false);

    prj.block("x", { currentArgs: prj.args({ n: 2 }), inputsValid: prj.runErrors([], { n: 2 }) });
    tree.updateFromResourceData(prj.changes());

    expect(await computable.getValue()).toBe(true);
  });

  test("current args changed without their record stop the block from running", async () => {
    const prj = new FakeProject();
    const runErrors = prj.runErrors([], { n: 1 });
    prj.block("x", { currentArgs: prj.args({ n: 1 }), inputsValid: runErrors });
    const tree = prj.tree();
    const computable = allowRunComputable(tree, "x");
    expect(await computable.getValue()).toBe(true);

    prj.block("x", { currentArgs: prj.args({ n: 2 }), inputsValid: runErrors });
    tree.updateFromResourceData(prj.changes());

    expect(await computable.getValue()).toBe(false);
  });
});

describe("withRunState", () => {
  test("a block whose results are up to date lets a changed dependent run despite its own run errors", () => {
    const [upstream, dependent] = withRunState([
      block({ id: "a", inputsValid: false }),
      block({ id: "b", stale: true, upstreams: ["a"] }),
    ]);
    expect(upstream.canRun).toBe(false);
    expect(dependent.canRun).toBe(true);
  });

  test("a changed block with run errors keeps its dependents from running", () => {
    const [upstream, dependent, further] = withRunState([
      block({ id: "a", stale: true, inputsValid: false }),
      block({ id: "b", stale: true, upstreams: ["a"] }),
      block({ id: "c", upstreams: ["a", "b"] }),
    ]);
    expect(upstream.canRun).toBe(false);
    expect(dependent.canRun).toBe(false);
    expect(further).toMatchObject({ stale: true, canRun: false });
  });

  test("a block with failed outputs and run errors keeps its dependents from running", () => {
    const [, dependent] = withRunState([
      block({ id: "a", outputErrors: true, inputsValid: false }),
      block({ id: "b", stale: true, upstreams: ["a"] }),
    ]);
    expect(dependent.canRun).toBe(false);
  });

  test("a block becomes stale and runnable when an upstream block is stale", () => {
    const [upstream, dependent] = withRunState([
      block({ id: "a", stale: true }),
      block({ id: "b", upstreams: ["a"] }),
    ]);
    expect(upstream).toMatchObject({ stale: true, canRun: true });
    expect(dependent).toMatchObject({ stale: true, canRun: true });
  });

  test("a block with up-to-date results has nothing to run", () => {
    const [b] = withRunState([block({ id: "a" })]);
    expect(b).toMatchObject({ stale: false, canRun: false });
  });

  test("a changed block that references a missing block cannot run", () => {
    const [b] = withRunState([block({ id: "a", stale: true, missingReference: true })]);
    expect(b.canRun).toBe(false);
  });
});

// Internals

/** Whether the block may run, read the way the project overview reads it. */
function allowRunComputable(tree: PlTreeState, blockId: string): Computable<boolean> {
  const entry = tree.entry();
  return Computable.make((ctx) => {
    const prj = ctx.accessor(entry).node();
    const currentArgs = prj
      .traverse({
        field: projectFieldName(blockId, "currentArgs"),
        assertFieldType: "Dynamic",
        stableIfNotFound: true,
      })
      ?.getDataAsJson();
    return argsAllowRun(prj, blockId, currentArgs);
  });
}

function allowRun(tree: PlTreeState, blockId: string): Promise<boolean> {
  return allowRunComputable(tree, blockId).getValue();
}

/** A block that ran with its current args, without errors, with no upstream blocks. */
function block(overrides: Partial<RunStateSource> & Pick<RunStateSource, "id">): RunStateSource {
  return {
    stale: false,
    outputErrors: false,
    inputsValid: true,
    missingReference: false,
    upstreams: [],
    ...overrides,
  };
}
