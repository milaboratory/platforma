import {
  createSignedResourceId,
  DefaultFinalResourceDataPredicate,
  NullSignedResourceId,
  type FieldData,
  type FieldType,
  type SignedResourceId,
} from "@milaboratories/pl-client";
import {
  Annotation,
  createColumnValueId,
  createGlobalPObjectId,
  type PColumnSpec,
  type UnlabeledDependencies,
  type UnlabeledDependents,
} from "@milaboratories/pl-model-common";
import { PlTreeState, type ExtendedResourceData } from "@milaboratories/pl-tree";
import { mapValues } from "es-toolkit";
import { getQuickJS } from "quickjs-emscripten";
import { beforeAll, describe, expect, test } from "vitest";
import { ProjectHelper } from "../model/project_helper";
import {
  projectFieldName,
  ProjectStructureKey,
  type ProjectField,
  type ProjectStructure,
} from "../model/project_model";
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

    expect(labelBlockColumnLinks({ dependencies, dependents }, blocks)).toEqual({
      dependencies: { ...dependencies, labels: { samples: "Samples & data" } },
      dependents: { ...dependents, labels: {} },
    });
  });

  test("gives no links while a side is not computed", () => {
    expect(labelBlockColumnLinks({ dependencies, dependents: undefined }, [])).toBeUndefined();
    expect(labelBlockColumnLinks({ dependencies: undefined, dependents }, [])).toBeUndefined();
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

const ROOT_ID = createSignedResourceId(1_000_001n);

/**
 * Resource ids stay unique across tests, as they are on a backend: the middle layer caches the
 * columns an args resource references by its id.
 */
let nextResourceId = 100n;

const READY: Omit<ExtendedResourceData, "id" | "kind" | "type" | "fields"> = {
  originalResourceId: NullSignedResourceId,
  error: NullSignedResourceId,
  inputsLocked: true,
  outputsLocked: true,
  resourceReady: true,
  final: true,
  kv: [],
};

const ARGS_AND_CTX_FIELDS = [
  "currentArgs",
  "prodArgs",
  "prodCtx",
  "prodUiCtx",
  "stagingCtx",
  "stagingUiCtx",
] as const satisfies readonly ProjectField["fieldName"][];

type ArgsAndCtxField = (typeof ARGS_AND_CTX_FIELDS)[number];

/** What a project field holds: a resource, an error, or nothing yet. */
type FieldContent = SignedResourceId | { error: SignedResourceId } | "unresolved";

type Columns = Record<string, { spec: PColumnSpec; cells: string[] }>;

/**
 * State of a result list: `locked` — complete; `open` — more columns may come; `failed` — it has
 * an error and will never lock.
 */
type FrameState = { state: "locked" | "open" | "failed" };

/** A project resource tree built in memory: its blocks, in project order, and their fields. */
class FakeProject {
  private readonly nodes: ExtendedResourceData[] = [];
  private sent = 0;
  private readonly blocks = new Map<string, Partial<Record<ArgsAndCtxField, FieldContent>>>();
  private readonly frameFields = new Map<SignedResourceId, FieldData[]>();

  /** Adds a block below the others, or replaces the fields of one already added. */
  block(blockId: string, fields: Partial<Record<ArgsAndCtxField, FieldContent>>): void {
    this.blocks.set(blockId, fields);
  }

  /** Args of a block. */
  args(args: unknown): SignedResourceId {
    return this.value("json/object", args);
  }

  /** A ready value resource holding `json`. */
  value(type: string, json: unknown): SignedResourceId {
    const id = this.newId();
    this.nodes.push({
      ...READY,
      id,
      kind: "Value",
      type: { name: type, version: "1" },
      data: Buffer.from(JSON.stringify(json)),
      fields: [],
    });
    return id;
  }

  /** An error a resource or field can hold. */
  error(message: string): SignedResourceId {
    return this.value("json/resourceError", { message });
  }

  /** A result list exporting the given columns, each with JSON data holding `cells`. */
  frame(columns: Columns, state: FrameState = { state: "locked" }): SignedResourceId {
    const id = this.newId();
    this.frameFields.set(id, []);
    this.extend(id, columns, state);
    return id;
  }

  /** Adds columns to a result list made by {@link frame}, and moves it to `state`. */
  extend(id: SignedResourceId, columns: Columns, { state }: FrameState): void {
    const fields = this.frameFields.get(id);
    if (fields === undefined) throw new Error("Not a result list of this project");
    for (const [name, { spec, cells }] of Object.entries(columns)) {
      const data = Object.fromEntries(cells.map((cell, i) => [`["s${i}"]`, cell]));
      fields.push(field("Input", `${name}.spec`, this.value("PColumnSpec", spec)));
      fields.push(
        field("Input", `${name}.data`, this.value("PColumnData/Json", { keyLength: 1, data })),
      );
    }
    const error = state === "failed" ? this.error("render failed") : NullSignedResourceId;
    this.nodes.push({
      ...READY,
      id,
      kind: "Structural",
      type: { name: "PFrame", version: "1" },
      inputsLocked: state === "locked",
      resourceReady: state === "locked",
      final: state === "locked",
      error,
      fields: [...fields],
    });
  }

  /** The tree of the project as it is now. */
  tree(): PlTreeState {
    const tree = new PlTreeState(ROOT_ID, DefaultFinalResourceDataPredicate);
    tree.updateFromResourceData(this.changes());
    return tree;
  }

  /**
   * The project resource and the resources added or changed since the last call: a final
   * resource already in the tree is not sent again.
   */
  changes(): ExtendedResourceData[] {
    const structure: ProjectStructure = {
      groups: [
        {
          id: "main",
          label: "Main",
          blocks: [...this.blocks.keys()].map((id) => ({ id, label: id, renderingMode: "Heavy" })),
        },
      ],
    };
    const fields = [...this.blocks].flatMap(([blockId, contents]) =>
      ARGS_AND_CTX_FIELDS.flatMap((name) => {
        const content = contents[name];
        return content === undefined
          ? []
          : [projectField(projectFieldName(blockId, name), content)];
      }),
    );
    const root: ExtendedResourceData = {
      ...READY,
      final: false,
      id: ROOT_ID,
      kind: "Structural",
      type: { name: "UserProject", version: "2" },
      fields,
      kv: [{ key: ProjectStructureKey, value: Buffer.from(JSON.stringify(structure)) }],
    };
    const added = this.nodes.slice(this.sent);
    this.sent = this.nodes.length;
    return [root, ...added];
  }

  private newId(): SignedResourceId {
    return createSignedResourceId(nextResourceId++);
  }
}

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

function field(type: FieldType, name: string, value: SignedResourceId): FieldData {
  return { name, type, value, error: NullSignedResourceId, status: "Resolved", valueIsFinal: true };
}

function projectField(name: string, content: FieldContent): FieldData {
  if (content === "unresolved") {
    return {
      name,
      type: "Dynamic",
      value: NullSignedResourceId,
      error: NullSignedResourceId,
      status: "Empty",
      valueIsFinal: false,
    };
  }
  if (typeof content === "object" && "error" in content) {
    return {
      name,
      type: "Dynamic",
      value: NullSignedResourceId,
      error: content.error,
      status: "Resolved",
      valueIsFinal: true,
    };
  }
  return field("Dynamic", name, content);
}
