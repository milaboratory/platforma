import {
  Annotation,
  createColumnValueId,
  createGlobalPObjectId,
  type PColumnSpec,
  type ColumnLink,
} from "@milaboratories/pl-model-common";
import type { PlTreeState } from "@milaboratories/pl-tree";
import { mapValues } from "es-toolkit";
import { getQuickJS } from "quickjs-emscripten";
import { beforeAll, describe, expect, test } from "vitest";
import { ProjectHelper } from "../model/project_helper";
import { FakeProject } from "../test/fake_project";
import {
  blockDependencies,
  blockDependents,
  labelBlockColumnLinks,
  type ColumnLinksEnv,
} from "./column_links";

let env: ColumnLinksEnv;

beforeAll(async () => {
  const projectHelper = new ProjectHelper(await getQuickJS());
  env = { projectHelper, logger: projectHelper.logger };
});

const condition = createGlobalPObjectId("samples", "condition");
const pick = (value: string, column = condition) => createColumnValueId({ column, value });

describe("blockDependencies and blockDependents", () => {
  test("check each reference against the last run of its producer, on both sides", async () => {
    const prj = new FakeProject();
    prj.block("samples", {
      currentArgs: prj.args({}),
      prodArgs: prj.args({}),
      prodCtx: prj.value("BContext", {}),
      prodUiCtx: prj.frame({ condition: { spec: SPEC, cells: ["treated", "mock"] } }),
    });
    prj.block("x", { currentArgs: prj.args({ levels: [pick("treated"), pick("control")] }) });
    const tree = prj.tree();

    const link: ColumnLink = {
      producer: { blockId: "samples", name: "condition" },
      holderBlockId: "x",
      ref: condition,
      values: ["treated", "control"],
      columnLabel: "Condition",
      check: { type: "missingValues", values: ["control"] },
    };
    expect(await dependenciesOf(tree, "x")).toEqual([link]);
    expect(await dependentsOf(tree, "samples")).toEqual([link]);
  });

  test("a producer with no last run is not run, labelled from what it prepares", async () => {
    const prj = new FakeProject();
    prj.block("samples", {
      currentArgs: prj.args({}),
      stagingCtx: prj.value("BContext", {}),
      stagingUiCtx: prj.frame({ condition: { spec: SPEC, cells: ["treated"] } }),
    });
    prj.block("x", { currentArgs: prj.args({ target: pick("treated") }) });
    const tree = prj.tree();

    expect(await dependenciesOf(tree, "x")).toMatchObject([
      { columnLabel: "Condition", check: { type: "notRun" } },
    ]);
    expect(await dependentsOf(tree, "samples")).toMatchObject([
      { holderBlockId: "x", check: { type: "notRun" } },
    ]);
  });

  test("a producer with a last run whose results failed to render is unavailable", async () => {
    const prj = new FakeProject();
    prj.block("samples", {
      prodArgs: prj.args({}),
      prodCtx: prj.value("BContext", {}),
      prodUiCtx: { error: prj.error("render failed") },
    });
    prj.block("x", { currentArgs: prj.args({ target: pick("treated") }) });
    const tree = prj.tree();

    expect(await dependenciesOf(tree, "x")).toMatchObject([{ check: { type: "unavailable" } }]);
    expect(await dependentsOf(tree, "samples")).toMatchObject([{ check: { type: "unavailable" } }]);
  });

  test("a producer with a last run whose results are not there yet is pending", async () => {
    const prj = new FakeProject();
    prj.block("samples", {
      prodArgs: prj.args({}),
      prodCtx: prj.value("BContext", {}),
      prodUiCtx: "unresolved",
    });
    prj.block("x", { currentArgs: prj.args({ target: pick("treated") }) });

    expect(await dependenciesOf(prj.tree(), "x")).toMatchObject([{ check: { type: "pending" } }]);
  });

  test("a failed result list that never locks settles the links", async () => {
    const prj = new FakeProject();
    prj.block("samples", {
      prodArgs: prj.args({}),
      prodCtx: prj.value("BContext", {}),
      prodUiCtx: prj.frame({}, { state: "failed" }),
    });
    prj.block("x", { currentArgs: prj.args({ target: pick("treated") }) });
    const tree = prj.tree();
    const dependencies = blockDependencies(tree.entry(), "x", env);
    const dependents = blockDependents(tree.entry(), "samples", env);

    expect(await dependencies.getFullValue()).toMatchObject({
      stable: true,
      value: [{ check: { type: "unavailable" } }],
    });
    expect(await dependents.getFullValue()).toMatchObject({
      stable: true,
      value: [{ check: { type: "unavailable" } }],
    });
  });

  test("an output of a result list still open is pending until the list locks", async () => {
    const prj = new FakeProject();
    const frame = prj.frame({}, { state: "open" });
    prj.block("samples", { prodArgs: prj.args({}), prodUiCtx: frame });
    prj.block("x", { currentArgs: prj.args({ target: pick("treated") }) });
    const tree = prj.tree();
    const dependencies = blockDependencies(tree.entry(), "x", env);

    expect(await dependencies.getFullValue()).toMatchObject({
      stable: false,
      value: [{ check: { type: "pending" } }],
    });

    prj.extend(frame, { condition: { spec: SPEC, cells: ["treated"] } }, { state: "locked" });
    tree.updateFromResourceData(prj.changes());

    expect(await dependencies.getFullValue()).toMatchObject({
      stable: true,
      value: [{ check: { type: "ok" } }],
    });
  });

  test("a block without current args is read from the args of its last run", async () => {
    const prj = new FakeProject();
    prj.block("samples", {
      prodArgs: prj.args({}),
      prodUiCtx: prj.frame({ condition: { spec: SPEC, cells: ["treated"] } }),
    });
    prj.block("x", { prodArgs: prj.args({ target: pick("treated") }) });

    expect(await dependenciesOf(prj.tree(), "x")).toMatchObject([{ check: { type: "ok" } }]);
  });

  test("a block whose argsIssues found errors keeps its links, read from its current args", async () => {
    const prj = new FakeProject();
    const args = { target: pick("treated"), threshold: undefined };
    prj.block("samples", {
      currentArgs: prj.args({}),
      prodArgs: prj.args({}),
      prodUiCtx: prj.frame({ condition: { spec: SPEC, cells: ["treated"] } }),
    });
    prj.block("x", {
      currentArgs: prj.args(args),
      inputsValid: prj.argsErrors([{ severity: "error", message: "Set a threshold" }], args),
    });
    const tree = prj.tree();

    expect(await dependenciesOf(tree, "x")).toMatchObject([
      { producer: { blockId: "samples" }, ref: condition, check: { type: "ok" } },
    ]);
    expect(await dependentsOf(tree, "samples")).toMatchObject([
      { holderBlockId: "x", ref: condition, check: { type: "ok" } },
    ]);
  });

  test("recalculate when the args of a block change", async () => {
    const prj = new FakeProject();
    prj.block("samples", {
      currentArgs: prj.args({}),
      prodArgs: prj.args({}),
      prodUiCtx: prj.frame({ condition: { spec: SPEC, cells: ["treated"] } }),
    });
    prj.block("x", { currentArgs: prj.args({ target: pick("control") }) });
    const tree = prj.tree();
    const dependencies = blockDependencies(tree.entry(), "x", env);

    expect(await dependencies.getValue()).toMatchObject([
      { check: { type: "missingValues", values: ["control"] } },
    ]);

    prj.block("x", { currentArgs: prj.args({ target: pick("treated") }) });
    tree.updateFromResourceData(prj.changes());

    expect(await dependencies.getValue()).toMatchObject([{ check: { type: "ok" } }]);
  });
});

describe("what the column links of a block watch", () => {
  const donor = createGlobalPObjectId("donors", "donor");

  /** Two producers, each referenced by one block below them, the second block also by a third. */
  function twoChains() {
    const prj = new FakeProject();
    const samplesFrame = prj.frame(
      { condition: { spec: SPEC, cells: ["treated"] } },
      { state: "open" },
    );
    prj.block("samples", {
      currentArgs: prj.args({}),
      prodArgs: prj.args({}),
      prodUiCtx: samplesFrame,
    });
    const donorsArgs = prj.args({});
    prj.block("donors", {
      currentArgs: donorsArgs,
      prodArgs: prj.args({}),
      prodUiCtx: prj.frame({ donor: { spec: SPEC, cells: ["d1"] } }),
    });
    prj.block("x", { currentArgs: prj.args({ target: pick("treated") }) });
    prj.block("y", { currentArgs: prj.args({ target: pick("d1", donor) }) });
    const tree = prj.tree();
    const watched = {
      xDependencies: blockDependencies(tree.entry(), "x", env),
      yDependencies: blockDependencies(tree.entry(), "y", env),
      samplesDependents: blockDependents(tree.entry(), "samples", env),
      donorsDependents: blockDependents(tree.entry(), "donors", env),
    };
    return { prj, tree, samplesFrame, donorsArgs, watched };
  }

  const changed = (watched: Record<string, { isChanged(): boolean }>) =>
    mapValues(watched, (computable) => computable.isChanged());

  test("a new run of one producer leaves the links of blocks not referencing it alone", async () => {
    const { prj, tree, donorsArgs, watched } = twoChains();
    await Promise.all(Object.values(watched).map((c) => c.getValue()));

    prj.block("donors", {
      currentArgs: donorsArgs,
      prodArgs: prj.args({ rerun: true }),
      prodUiCtx: prj.frame({ donor: { spec: SPEC, cells: ["d2"] } }),
    });
    tree.updateFromResourceData(prj.changes());

    expect(changed(watched)).toEqual({
      xDependencies: false,
      yDependencies: true,
      samplesDependents: false,
      donorsDependents: true,
    });
  });

  test("a column added to a run leaves the links to its other columns alone", async () => {
    const { prj, tree, samplesFrame, watched } = twoChains();
    await Promise.all(Object.values(watched).map((c) => c.getValue()));

    prj.extend(samplesFrame, { batch: { spec: SPEC, cells: ["b1"] } }, { state: "open" });
    tree.updateFromResourceData(prj.changes());

    expect(changed(watched)).toEqual({
      xDependencies: false,
      yDependencies: false,
      samplesDependents: false,
      donorsDependents: false,
    });
  });

  test("an args edit of a block reaches its dependencies and the dependents of the blocks above", async () => {
    const { prj, tree, watched } = twoChains();
    await Promise.all(Object.values(watched).map((c) => c.getValue()));

    prj.block("x", { currentArgs: prj.args({ target: pick("mock") }) });
    tree.updateFromResourceData(prj.changes());

    expect(changed(watched)).toEqual({
      xDependencies: true,
      yDependencies: false,
      samplesDependents: true,
      donorsDependents: true,
    });
  });
});

describe("labelBlockColumnLinks", () => {
  const dependencies: ColumnLink[] = [
    {
      producer: { blockId: "samples", name: "condition" },
      holderBlockId: "x",
      ref: condition,
      values: null,
      columnLabel: null,
      check: { type: "ok" },
    },
  ];
  const dependents: ColumnLink[] = [
    {
      producer: { blockId: "x", name: "condition" },
      holderBlockId: "untitled",
      ref: condition,
      values: null,
      columnLabel: null,
      check: { type: "ok" },
    },
  ];

  test("labels the blocks the links name by their titles in the overview", () => {
    const blocks = [
      { id: "samples", title: "Samples & data" },
      { id: "untitled", title: undefined },
    ];

    expect(labelBlockColumnLinks({ blockId: "x", dependencies, dependents }, blocks)).toEqual({
      blockId: "x",
      dependencies,
      dependents,
      labels: { samples: "Samples & data" },
    });
  });

  test("gives no links while a side is not computed", () => {
    expect(
      labelBlockColumnLinks({ blockId: "x", dependencies, dependents: undefined }, []),
    ).toBeUndefined();
    expect(
      labelBlockColumnLinks({ blockId: "x", dependencies: undefined, dependents }, []),
    ).toBeUndefined();
  });
});

// Internals

const SPEC: PColumnSpec = {
  kind: "PColumn",
  name: "condition",
  valueType: "String",
  axesSpec: [{ name: "sample", type: "String" }],
  annotations: { [Annotation.Label]: "Condition" },
};

async function dependenciesOf(tree: PlTreeState, blockId: string) {
  const value = await blockDependencies(tree.entry(), blockId, env).getValue();
  if (value === undefined) throw new Error(`No dependencies of ${blockId}`);
  return value;
}

async function dependentsOf(tree: PlTreeState, blockId: string) {
  const value = await blockDependents(tree.entry(), blockId, env).getValue();
  if (value === undefined) throw new Error(`No dependents of ${blockId}`);
  return value;
}
