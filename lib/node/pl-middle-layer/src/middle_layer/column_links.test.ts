import {
  Annotation,
  createColumnValueId,
  createGlobalPObjectId,
  type PColumnSpec,
  type UnlabeledDependencies,
  type UnlabeledDependents,
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

    expect(await dependenciesOf(tree, "x")).toEqual({
      argsSource: "current",
      items: [
        {
          producerBlockId: "samples",
          output: "condition",
          ref: condition,
          values: ["treated", "control"],
          columnLabel: "Condition",
          status: { type: "broken", reason: "missingValues", values: ["control"] },
        },
      ],
    });
    expect(await dependentsOf(tree, "samples")).toEqual({
      items: [
        {
          dependentBlockId: "x",
          output: "condition",
          ref: condition,
          values: ["treated", "control"],
          columnLabel: "Condition",
          status: { type: "missingValues", values: ["control"] },
        },
      ],
      hasUnrunChanges: false,
    });
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

    expect((await dependenciesOf(tree, "x")).items).toMatchObject([
      { columnLabel: "Condition", status: { type: "notRun" } },
    ]);
    expect(await dependentsOf(tree, "samples")).toMatchObject({
      items: [{ dependentBlockId: "x", status: { type: "notRun" } }],
      hasUnrunChanges: true,
    });
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

    expect((await dependenciesOf(tree, "x")).items).toMatchObject([
      { status: { type: "broken", reason: "unavailable" } },
    ]);
    expect((await dependentsOf(tree, "samples")).items).toMatchObject([
      { status: { type: "broken", reason: "notExported" } },
    ]);
  });

  test("a producer with a last run whose results are not there yet is pending", async () => {
    const prj = new FakeProject();
    prj.block("samples", {
      prodArgs: prj.args({}),
      prodCtx: prj.value("BContext", {}),
      prodUiCtx: "unresolved",
    });
    prj.block("x", { currentArgs: prj.args({ target: pick("treated") }) });

    expect((await dependenciesOf(prj.tree(), "x")).items).toMatchObject([
      { status: { type: "pending" } },
    ]);
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
      value: { items: [{ status: { type: "broken", reason: "unavailable" } }] },
    });
    expect(await dependents.getFullValue()).toMatchObject({
      stable: true,
      value: { items: [{ status: { type: "broken", reason: "notExported" } }] },
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
      value: { items: [{ status: { type: "pending" } }] },
    });

    prj.extend(frame, { condition: { spec: SPEC, cells: ["treated"] } }, { state: "locked" });
    tree.updateFromResourceData(prj.changes());

    expect(await dependencies.getFullValue()).toMatchObject({
      stable: true,
      value: { items: [{ status: { type: "ok" } }] },
    });
  });

  test("a block without current args is read from the args of its last run", async () => {
    const prj = new FakeProject();
    prj.block("samples", {
      prodArgs: prj.args({}),
      prodUiCtx: prj.frame({ condition: { spec: SPEC, cells: ["treated"] } }),
    });
    prj.block("x", { prodArgs: prj.args({ target: pick("treated") }) });

    expect(await dependenciesOf(prj.tree(), "x")).toMatchObject({
      argsSource: "lastRun",
      items: [{ status: { type: "ok" } }],
    });
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

    expect(await dependenciesOf(tree, "x")).toMatchObject({
      argsSource: "current",
      items: [{ producerBlockId: "samples", ref: condition, status: { type: "ok" } }],
    });
    expect((await dependentsOf(tree, "samples")).items).toMatchObject([
      { dependentBlockId: "x", ref: condition, status: { type: "ok" } },
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

    expect((await dependencies.getValue())?.items).toMatchObject([
      { status: { type: "broken", reason: "missingValues", values: ["control"] } },
    ]);

    prj.block("x", { currentArgs: prj.args({ target: pick("treated") }) });
    tree.updateFromResourceData(prj.changes());

    expect((await dependencies.getValue())?.items).toMatchObject([{ status: { type: "ok" } }]);
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
  const dependencies: UnlabeledDependencies = {
    argsSource: "current",
    items: [
      {
        producerBlockId: "samples",
        output: "condition",
        ref: condition,
        values: null,
        columnLabel: null,
        status: { type: "ok" },
      },
    ],
  };
  const dependents: UnlabeledDependents = {
    items: [
      {
        dependentBlockId: "untitled",
        output: "condition",
        ref: condition,
        values: null,
        columnLabel: null,
        status: { type: "ok" },
      },
    ],
    hasUnrunChanges: false,
  };

  test("labels the blocks the links name by their titles in the overview", () => {
    const blocks = [
      { id: "samples", title: "Samples & data" },
      { id: "untitled", title: undefined },
    ];

    expect(labelBlockColumnLinks({ blockId: "x", dependencies, dependents }, blocks)).toEqual({
      blockId: "x",
      dependencies: { ...dependencies, labels: { samples: "Samples & data" } },
      dependents: { ...dependents, labels: {} },
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
