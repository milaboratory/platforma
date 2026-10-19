import {
  Annotation,
  createColumnFilteredId,
  createColumnValueId,
  createGlobalPObjectId,
  createPlRef,
  type FieldTraversalStep,
  type OutputDependency,
  type PColumnSpec,
  type UpstreamBlockCtx,
} from "@milaboratories/pl-model-common";
import { afterEach, describe, expect, test, vi } from "vitest";
import { computeDependencies, computeDependents } from "./compute";
import { BlockRenderCtx } from "../../render";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "cfgRenderCtx");
  NODES.clear();
});

const condition = createGlobalPObjectId("samples", "condition");

describe("computeDependencies", () => {
  test("args without references read no other block", () => {
    const runtime = installRuntime({ args: { title: "x" } });

    expect(computeDependencies(new BlockRenderCtx())).toEqual({
      argsSource: "current",
      items: [],
      labels: {},
    });
    expect(runtime.getUpstreamBlockCtx).not.toHaveBeenCalled();
  });

  test("without current args the last run's args are read", () => {
    const tree = new FakeTree();
    installRuntime({
      lastRunArgs: { condition: createPlRef("samples", "condition") },
      upstream: [{ blockId: "samples", prodCtx: tree.frame({ condition: tree.column() }) }],
    });

    expect(computeDependencies(new BlockRenderCtx())).toMatchObject({
      argsSource: "lastRun",
      items: [{ producerBlockId: "samples", status: { type: "ok" } }],
    });
  });

  test("with neither current nor last-run args nothing is read", () => {
    const runtime = installRuntime({});

    expect(computeDependencies(new BlockRenderCtx())).toEqual({
      argsSource: "none",
      items: [],
      labels: {},
    });
    expect(runtime.getUpstreamBlockCtx).not.toHaveBeenCalled();
  });

  test("a producer below this block, or deleted, is unavailable", () => {
    installRuntime({ args: { condition: createPlRef("samples", "condition") } });

    expect(statusesOf(computeDependencies(new BlockRenderCtx()))).toEqual([
      { type: "broken", reason: "unavailable" },
    ]);
  });

  test("a reference to an output of this block is unavailable", () => {
    const tree = new FakeTree();
    installRuntime({
      blockId: "self",
      args: { own: createPlRef("self", "condition") },
      upstream: [{ blockId: "self", prodCtx: tree.frame({ condition: tree.column() }) }],
    });

    expect(statusesOf(computeDependencies(new BlockRenderCtx()))).toEqual([
      { type: "broken", reason: "unavailable" },
    ]);
  });

  test("a producer whose run results are still rendering is pending", () => {
    installRuntime({
      args: { condition: createPlRef("samples", "condition") },
      upstream: [{ blockId: "samples", prodIncomplete: true }],
    });

    expect(statusesOf(computeDependencies(new BlockRenderCtx()))).toEqual([{ type: "pending" }]);
  });

  test("an output a producer only prepares before its first run is unavailable, with its label", () => {
    const tree = new FakeTree();
    installRuntime({
      args: { condition: createPlRef("samples", "condition") },
      upstream: [{ blockId: "samples", stagingCtx: tree.frame({ condition: tree.column() }) }],
    });

    expect(computeDependencies(new BlockRenderCtx()).items).toMatchObject([
      { columnLabel: "Condition", status: { type: "broken", reason: "unavailable" } },
    ]);
  });

  test("an output pending in the run takes its label from the prepared results", () => {
    const tree = new FakeTree();
    installRuntime({
      args: { condition: createPlRef("samples", "condition") },
      upstream: [
        {
          blockId: "samples",
          prodCtx: tree.frame({}, { locked: false }),
          stagingCtx: tree.frame({ condition: tree.column() }),
        },
      ],
    });

    expect(computeDependencies(new BlockRenderCtx()).items).toMatchObject([
      { columnLabel: "Condition", status: { type: "pending" } },
    ]);
  });

  test("an exported column is labeled by the run alone", () => {
    const tree = new FakeTree();
    const unlabeled = { ...SPEC, annotations: {} };
    installRuntime({
      args: { condition: createPlRef("samples", "condition") },
      upstream: [
        {
          blockId: "samples",
          prodCtx: tree.frame({ condition: tree.column({ cells: [], spec: unlabeled }) }),
          stagingCtx: tree.frame({ condition: tree.column() }),
        },
      ],
    });

    expect(computeDependencies(new BlockRenderCtx()).items).toMatchObject([
      { columnLabel: null, status: { type: "ok" } },
    ]);
  });

  test("an output neither run nor prepared has no label", () => {
    const tree = new FakeTree();
    installRuntime({
      args: { condition: createPlRef("samples", "condition") },
      upstream: [{ blockId: "samples", prodCtx: tree.frame({}), stagingCtx: tree.frame({}) }],
    });

    expect(computeDependencies(new BlockRenderCtx()).items).toMatchObject([
      { columnLabel: null, status: { type: "broken", reason: "unavailable" } },
    ]);
  });

  test("an output missing from a run whose result list is open is pending, else unavailable", () => {
    const tree = new FakeTree();
    const args = { condition: createPlRef("samples", "condition") };

    installRuntime({
      args,
      upstream: [{ blockId: "samples", prodCtx: tree.frame({}, { locked: false }) }],
    });
    expect(statusesOf(computeDependencies(new BlockRenderCtx()))).toEqual([{ type: "pending" }]);

    installRuntime({ args, upstream: [{ blockId: "samples", prodCtx: tree.frame({}) }] });
    expect(statusesOf(computeDependencies(new BlockRenderCtx()))).toEqual([
      { type: "broken", reason: "unavailable" },
    ]);
  });

  test("a listed column whose spec is not there is pending while the run is open, else unavailable", () => {
    const tree = new FakeTree();
    const args = { condition: createPlRef("samples", "condition") };

    installRuntime({
      args,
      upstream: [
        {
          blockId: "samples",
          prodCtx: tree.frame({ condition: { spec: undefined } }, { locked: false }),
        },
      ],
    });
    expect(statusesOf(computeDependencies(new BlockRenderCtx()))).toEqual([{ type: "pending" }]);

    installRuntime({
      args,
      upstream: [{ blockId: "samples", prodCtx: tree.frame({ condition: { spec: undefined } }) }],
    });
    expect(statusesOf(computeDependencies(new BlockRenderCtx()))).toEqual([
      { type: "broken", reason: "unavailable" },
    ]);
  });

  test("a column whose data is not there is pending while the run is open, else unavailable", () => {
    const tree = new FakeTree();
    const args = { condition: createPlRef("samples", "condition") };
    const noData = { spec: SPEC, data: undefined };

    installRuntime({
      args,
      upstream: [
        { blockId: "samples", prodCtx: tree.frame({ condition: noData }, { locked: false }) },
      ],
    });
    expect(statusesOf(computeDependencies(new BlockRenderCtx()))).toEqual([{ type: "pending" }]);

    installRuntime({
      args,
      upstream: [{ blockId: "samples", prodCtx: tree.frame({ condition: noData }) }],
    });
    expect(statusesOf(computeDependencies(new BlockRenderCtx()))).toEqual([
      { type: "broken", reason: "unavailable" },
    ]);
  });

  test("picked values are checked against the exported cells", () => {
    const tree = new FakeTree();
    installRuntime({
      args: {
        levels: [
          createColumnValueId({ column: condition, value: "treated" }),
          createColumnValueId({ column: condition, value: "control" }),
        ],
      },
      upstream: [
        {
          blockId: "samples",
          prodCtx: tree.frame({ condition: tree.column({ cells: ["treated", "mock"] }) }),
        },
      ],
      labels: { samples: "Samples" },
    });

    expect(computeDependencies(new BlockRenderCtx())).toEqual({
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
      labels: { samples: "Samples" },
    });
  });

  test("a column several references pick from is read once", () => {
    const tree = new FakeTree();
    const filtered = createColumnFilteredId({ source: condition, axisFilters: [[0, "s0"]] });
    const runtime = installRuntime({
      args: {
        whole: createColumnValueId({ column: condition, value: "treated" }),
        filtered: createColumnValueId({ column: filtered, value: "mock" }),
      },
      upstream: [
        {
          blockId: "samples",
          prodCtx: tree.frame({ condition: tree.column({ cells: ["treated", "mock"] }) }),
        },
      ],
    });

    expect(statusesOf(computeDependencies(new BlockRenderCtx()))).toEqual([
      { type: "ok" },
      { type: "ok" },
    ]);
    expect(runtime.dataReads()).toBe(1);
  });

  test("values of a column whose data is not JSON are unchecked as unreadable", () => {
    const tree = new FakeTree();
    installRuntime({
      args: { condition: createColumnValueId({ column: condition, value: "treated" }) },
      upstream: [{ blockId: "samples", prodCtx: tree.frame({ condition: tree.binaryColumn() }) }],
    });

    expect(statusesOf(computeDependencies(new BlockRenderCtx()))).toEqual([
      { type: "unchecked", reason: "unreadable" },
    ]);
  });

  test("a runtime that cannot list the runs above leaves references unchecked as unsupported", () => {
    const runtime = installRuntime({
      args: { condition: createPlRef("samples", "condition") },
      lazyColumnStatus: false,
    });

    expect(statusesOf(computeDependencies(new BlockRenderCtx()))).toEqual([
      { type: "unchecked", reason: "unsupported" },
    ]);
    expect(runtime.getUpstreamBlockCtx).not.toHaveBeenCalled();
  });
});

describe("computeDependents", () => {
  test("a runtime that cannot list dependents reports it", () => {
    installRuntime({ blockId: "self", outputDependencies: undefined });

    expect(computeDependents(new BlockRenderCtx())).toEqual({ type: "unsupported" });
  });

  test("a runtime that does not report the block id cannot list dependents", () => {
    installRuntime({ blockId: undefined, outputDependencies: [] });

    expect(computeDependents(new BlockRenderCtx())).toEqual({ type: "unsupported" });
  });

  test("no dependents read no block", () => {
    const runtime = installRuntime({ blockId: "self", outputDependencies: [] });

    expect(computeDependents(new BlockRenderCtx())).toEqual({ type: "ok", items: [], labels: {} });
    expect(runtime.getUpstreamBlockCtx).not.toHaveBeenCalled();
  });

  test("a reference to an output this block does not export is broken as notExported", () => {
    installRuntime({
      blockId: "self",
      outputDependencies: [dependency("below", ["treated"])],
      upstream: [{ blockId: "self" }],
    });

    expect(statusesOf(computeDependents(new BlockRenderCtx()))).toEqual([
      { type: "broken", reason: "notExported" },
    ]);
  });

  test("an output this block only prepares is not exported, labeled from the prepared results", () => {
    const tree = new FakeTree();
    installRuntime({
      blockId: "self",
      outputDependencies: [dependency("below", ["treated"])],
      upstream: [{ blockId: "self", stagingCtx: tree.frame({ condition: tree.column() }) }],
    });

    const output = computeDependents(new BlockRenderCtx());
    expect("items" in output && output.items).toMatchObject([
      { columnLabel: "Condition", status: { type: "broken", reason: "notExported" } },
    ]);
  });

  test("a reference to values that cannot be read is unchecked as unreadable", () => {
    const tree = new FakeTree();
    installRuntime({
      blockId: "self",
      outputDependencies: [dependency("below", ["treated"])],
      upstream: [{ blockId: "self", prodCtx: tree.frame({ condition: tree.binaryColumn() }) }],
    });

    expect(statusesOf(computeDependents(new BlockRenderCtx()))).toEqual([
      { type: "unchecked", reason: "unreadable" },
    ]);
  });

  test("a runtime that cannot list the runs above leaves references unchecked as unsupported", () => {
    const runtime = installRuntime({
      blockId: "self",
      outputDependencies: [dependency("below", ["treated"])],
      lazyColumnStatus: false,
    });

    expect(statusesOf(computeDependents(new BlockRenderCtx()))).toEqual([
      { type: "unchecked", reason: "unsupported" },
    ]);
    expect(runtime.getUpstreamBlockCtx).not.toHaveBeenCalled();
  });

  test("a reference to an output of a run still rendering is pending", () => {
    installRuntime({
      blockId: "self",
      outputDependencies: [dependency("below", null)],
      upstream: [{ blockId: "self", prodIncomplete: true }],
    });

    expect(statusesOf(computeDependents(new BlockRenderCtx()))).toEqual([{ type: "pending" }]);
  });

  test("values the dependent picked and this block's output lacks are listed", () => {
    const tree = new FakeTree();
    installRuntime({
      blockId: "self",
      outputDependencies: [dependency("below", ["treated", "control"]), dependency("other", null)],
      upstream: [
        {
          blockId: "self",
          prodCtx: tree.frame({ condition: tree.column({ cells: ["treated"] }) }),
        },
      ],
      labels: { below: "Below" },
    });

    expect(computeDependents(new BlockRenderCtx())).toEqual({
      type: "ok",
      items: [
        {
          ...dependency("below", ["treated", "control"]),
          columnLabel: "Condition",
          status: { type: "missingValues", values: ["control"] },
        },
        { ...dependency("other", null), columnLabel: "Condition", status: { type: "ok" } },
      ],
      labels: { below: "Below" },
    });
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

type ColumnFixture = { spec: undefined } | { spec: PColumnSpec; data: undefined | string };

type FakeNode = {
  type: string;
  locked: boolean;
  fields: Map<string, undefined | string>;
  content: undefined | string;
};

/**
 * Resources of the fake project tree, by handle. Handles stay unique across tests: caches of the
 * model key on them.
 */
const NODES = new Map<string, FakeNode>();
let handleSeq = 0;

/** Builds resources of the fake project tree. */
class FakeTree {
  /** A result list exporting the given columns. */
  frame(columns: Record<string, ColumnFixture>, options: { locked: boolean } = { locked: true }) {
    const fields = new Map<string, undefined | string>();
    for (const [name, column] of Object.entries(columns)) {
      fields.set(
        `${name}.spec`,
        ifDefined(column.spec, (spec) => this.json("Spec", spec)),
      );
      if ("data" in column && column.data !== undefined) fields.set(`${name}.data`, column.data);
    }
    return this.add({ type: "PFrame", locked: options.locked, fields, content: undefined });
  }

  /** A column with JSON data holding `cells`, one per sample. */
  column(options: { cells: string[]; spec?: PColumnSpec } = { cells: [] }): ColumnFixture {
    const data = Object.fromEntries(options.cells.map((cell, i) => [`["s${i}"]`, cell]));
    return {
      spec: options.spec ?? SPEC,
      data: this.json("PColumnData/Json", { keyLength: 1, data }),
    };
  }

  /** A column whose data is binary, which the model cannot read. */
  binaryColumn(): ColumnFixture {
    return { spec: SPEC, data: this.json("PColumnData/Binary", {}) };
  }

  private json(type: string, value: unknown): string {
    return this.add({ type, locked: true, fields: new Map(), content: JSON.stringify(value) });
  }

  private add(node: FakeNode): string {
    const handle = `handle-${++handleSeq}`;
    NODES.set(handle, node);
    return handle;
  }
}

/**
 * Installs a fake runtime as `globalThis.cfgRenderCtx`. `upstream` lists this block and the blocks
 * above it, with result lists built by {@link FakeTree}.
 */
function installRuntime(options: {
  blockId?: string;
  args?: unknown;
  lastRunArgs?: unknown;
  upstream?: UpstreamBlockCtx<string>[];
  outputDependencies?: OutputDependency[];
  labels?: Record<string, string>;
  lazyColumnStatus?: boolean;
}) {
  let dataReads = 0;
  const node = (handle: string): FakeNode => {
    const found = NODES.get(handle);
    if (found === undefined) throw new Error(`unknown handle ${handle}`);
    return found;
  };
  const getUpstreamBlockCtx = vi.fn(() => options.upstream ?? []);
  const runtime = {
    featureFlags: {
      blockIdSupport: options.blockId !== undefined,
      outputDependenciesSupport: options.outputDependencies !== undefined,
      lazyColumnStatusSupport: options.lazyColumnStatus ?? true,
    },
    args: ifDefined(options.args, (args) => JSON.stringify(args)),
    activeArgs: ifDefined(options.lastRunArgs, (args) => JSON.stringify(args)),
    getBlockId: () => options.blockId,
    getBlockLabel: (blockId: string) => {
      const label = options.labels?.[blockId];
      if (label === undefined) throw new Error(`Block ${blockId} not found.`);
      return label;
    },
    getOutputDependencies: () => options.outputDependencies,
    getUpstreamBlockCtx,
    resolveWithCommon: (
      handle: string,
      _common: unknown,
      ...steps: (FieldTraversalStep | string)[]
    ) => {
      let current: undefined | string = handle;
      for (const step of steps) {
        if (current === undefined) return undefined;
        current = node(current).fields.get(typeof step === "string" ? step : step.field);
      }
      return current;
    },
    getResourceType: (handle: string) => ({ name: node(handle).type, version: "1" }),
    getInputsLocked: (handle: string) => node(handle).locked,
    listInputFields: (handle: string) => [...node(handle).fields.keys()],
    hasData: (handle: string) => node(handle).content !== undefined,
    getIsReadyOrError: (handle: string) => node(handle).content !== undefined,
    getError: () => undefined,
    getDataAsString: (handle: string) => {
      const { type, content } = node(handle);
      if (type === "PColumnData/Json") dataReads++;
      return content;
    },
  };
  Object.assign(globalThis, { cfgRenderCtx: runtime });
  return { getUpstreamBlockCtx, dataReads: () => dataReads };
}

function statusesOf(output: { items: { status: unknown }[] } | { type: "unsupported" }) {
  if (!("items" in output)) throw new Error("expected items");
  return output.items.map((item) => item.status);
}

function dependency(dependentBlockId: string, values: null | string[]): OutputDependency {
  return {
    dependentBlockId,
    output: "condition",
    ref: createGlobalPObjectId("self", "condition"),
    values,
  };
}

function ifDefined<T, R>(value: T | undefined, map: (value: T) => R): R | undefined {
  return value === undefined ? undefined : map(value);
}
