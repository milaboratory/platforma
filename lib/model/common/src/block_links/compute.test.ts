import { beforeEach, describe, expect, test } from "vitest";
import {
  Annotation,
  collectColumnReferences,
  createColumnFilteredId,
  createColumnValueId,
  type ColumnUniversalId,
  type PColumnSpec,
} from "../drivers";
import { canonicalizeJson } from "../json";
import { createGlobalPObjectId, createLocalPObjectId } from "../pool";
import { createPlRef } from "../ref";
import { relocateBlockIds } from "../template";
import {
  computeDependencies,
  computeDependents,
  labelColumnLinks,
  type ColumnLinksSource,
} from "./compute";
import type { ColumnFieldStep, ExportNode } from "./export_pool";
import type { UnlabeledColumnLinks } from "./types";

beforeEach(() => {
  jsonReads.count = 0;
  fieldReads.length = 0;
});

const condition = createGlobalPObjectId("samples", "condition");
const donor = createGlobalPObjectId("samples", "donor");
const pick = (value: string, column: ColumnUniversalId = condition) =>
  createColumnValueId({ column, value });

describe("computeDependencies", () => {
  test("every block gets an entry, also one with no args", () => {
    const { links } = run([{ id: "samples", args: {} }, { id: "empty" }]);

    expect(links).toEqual({
      samples: {
        dependencies: { argsSource: "current", items: [] },
        dependents: { items: [], hasUnrunChanges: true },
      },
      empty: {
        dependencies: { argsSource: "none", items: [] },
        dependents: { items: [], hasUnrunChanges: false },
      },
    });
  });

  test("args without references read no other block", () => {
    const { reads } = run([
      { id: "samples", args: {}, prodCtx: frame({}) },
      { id: "x", args: { title: "x" } },
    ]);

    expect(reads.filter((read) => read.endsWith(":prod"))).toEqual([]);
  });

  test("without current args the last run's args are read", () => {
    const { links } = run([
      { id: "samples", args: {}, prodCtx: frame({ condition: column() }) },
      { id: "x", lastRunArgs: { condition: createPlRef("samples", "condition") } },
    ]);

    expect(links.x.dependencies).toMatchObject({
      argsSource: "lastRun",
      items: [{ producerBlockId: "samples", status: { type: "ok" } }],
    });
  });

  test("the last run's references are not read for a block with current args", () => {
    const { reads } = run([
      { id: "samples", args: {}, prodCtx: frame({ condition: column() }) },
      { id: "x", args: { c: pick("a") }, lastRunArgs: { c: pick("old") } },
    ]);

    expect(reads).toContain("x:references:current");
    expect(reads).not.toContain("x:references:lastRun");
  });

  test("a producer below the block, or deleted, is unavailable and gets no dependents", () => {
    const { links, reads } = run([
      { id: "x", args: { condition: createPlRef("samples", "condition"), gone: pick("a", gone) } },
      { id: "samples", args: {}, prodCtx: frame({ condition: column() }) },
    ]);

    expect(links.x.dependencies.items).toMatchObject([
      { producerBlockId: "samples", columnLabel: null, status: unavailable },
      { producerBlockId: "deleted", columnLabel: null, status: unavailable },
    ]);
    expect(links.samples.dependents.items).toEqual([]);
    expect(reads.filter((read) => read.endsWith(":prod"))).toEqual([]);
  });

  test("a reference to an output of the block itself is unavailable", () => {
    const { links } = run([
      {
        id: "self",
        args: { own: createPlRef("self", "condition") },
        prodCtx: frame({ condition: column() }),
      },
    ]);

    expect(links.self.dependencies.items).toMatchObject([{ status: unavailable }]);
    expect(links.self.dependents.items).toEqual([]);
  });

  test("a producer whose run results are still rendering is pending", () => {
    const { links } = run([
      { id: "samples", args: {}, prodIncomplete: true },
      { id: "x", args: { condition: createPlRef("samples", "condition") } },
    ]);

    expect(statuses(links.x)).toEqual([{ type: "pending" }]);
  });

  test("a producer with no last run is not run, labelled from what it prepares", () => {
    const { links } = run([
      { id: "samples", args: {}, stagingCtx: frame({ condition: column() }) },
      { id: "x", args: { condition: pick("a") } },
    ]);

    expect(links.x.dependencies.items).toMatchObject([
      { columnLabel: "Condition", status: { type: "notRun" } },
    ]);
    expect(links.samples.dependents.items).toMatchObject([
      { dependentBlockId: "x", columnLabel: "Condition", status: { type: "notRun" } },
    ]);
  });

  test("an output pending in the run takes its label from the prepared results", () => {
    const { links } = run([
      {
        id: "samples",
        args: {},
        prodCtx: frame({}, { locked: false }),
        stagingCtx: frame({ condition: column() }),
      },
      { id: "x", args: { condition: createPlRef("samples", "condition") } },
    ]);

    expect(links.x.dependencies.items).toMatchObject([
      { columnLabel: "Condition", status: { type: "pending" } },
    ]);
  });

  test("an exported column is labelled by the run alone, without reading what is prepared", () => {
    const unlabeled = { ...SPEC, annotations: {} };
    const { links, reads } = run([
      {
        id: "samples",
        args: {},
        prodCtx: frame({ condition: column({ cells: [], spec: unlabeled }) }),
        stagingCtx: frame({ condition: column() }),
      },
      { id: "x", args: { condition: createPlRef("samples", "condition") } },
    ]);

    expect(links.x.dependencies.items).toMatchObject([{ columnLabel: null, status: ok }]);
    expect(reads).not.toContain("samples:staging");
  });

  test("an output neither run nor prepared has no label", () => {
    const { links } = run([
      { id: "samples", args: {}, prodCtx: frame({}), stagingCtx: frame({}) },
      { id: "x", args: { condition: createPlRef("samples", "condition") } },
    ]);

    expect(links.x.dependencies.items).toMatchObject([{ columnLabel: null, status: unavailable }]);
  });

  test("an output missing from a run whose result list is open is pending, else unavailable", () => {
    const args = { condition: createPlRef("samples", "condition") };

    const open = run([
      { id: "samples", args: {}, prodCtx: frame({}, { locked: false }) },
      { id: "x", args },
    ]);
    expect(statuses(open.links.x)).toEqual([{ type: "pending" }]);

    const final = run([
      { id: "samples", args: {}, prodCtx: frame({}) },
      { id: "x", args },
    ]);
    expect(statuses(final.links.x)).toEqual([unavailable]);
  });

  test("a listed column whose spec is not there is pending while the run is open, else unavailable", () => {
    const args = { condition: createPlRef("samples", "condition") };

    const open = run([
      {
        id: "samples",
        args: {},
        prodCtx: frame({ condition: { spec: undefined } }, { locked: false }),
      },
      { id: "x", args },
    ]);
    expect(statuses(open.links.x)).toEqual([{ type: "pending" }]);

    const final = run([
      { id: "samples", args: {}, prodCtx: frame({ condition: { spec: undefined } }) },
      { id: "x", args },
    ]);
    expect(statuses(final.links.x)).toEqual([unavailable]);
  });

  test("a column is exported by its spec; values it does not list are read from the data", () => {
    const listed = {
      ...SPEC,
      annotations: { ...SPEC.annotations, [Annotation.DiscreteValues]: '["treated"]' },
    };
    const linksOf = (args: unknown, spec: PColumnSpec, options?: { locked: boolean }) =>
      run([
        {
          id: "samples",
          args: {},
          prodCtx: frame({ condition: { spec, data: undefined } }, options),
        },
        { id: "x", args: { condition: args } },
      ]).links.x;

    expect(linksOf(createPlRef("samples", "condition"), SPEC).dependencies.items).toMatchObject([
      { columnLabel: "Condition", status: ok },
    ]);
    expect(statuses(linksOf(pick("treated"), SPEC, { locked: false }))).toEqual([
      { type: "pending" },
    ]);
    expect(statuses(linksOf(pick("treated"), SPEC))).toEqual([unreadable]);
    expect(statuses(linksOf(pick("control"), listed))).toEqual([
      { type: "broken", reason: "missingValues", values: ["control"] },
    ]);
  });

  test("picked values are checked against the exported cells", () => {
    const { links } = run([
      {
        id: "samples",
        args: {},
        prodCtx: frame({ condition: column({ cells: ["treated", "mock"] }) }),
      },
      { id: "x", args: { levels: [pick("treated"), pick("control")] } },
    ]);

    expect(links.x.dependencies).toEqual({
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
  });

  test("a column several references of one block pick from is read once", () => {
    const filtered = createColumnFilteredId({ source: condition, axisFilters: [[0, "s0"]] });
    const { source } = run([
      {
        id: "samples",
        args: {},
        prodCtx: frame({ condition: column({ cells: ["treated", "mock"] }) }),
      },
      { id: "x", args: { whole: pick("treated"), filtered: pick("mock", filtered) } },
    ]);
    jsonReads.count = 0;
    const reads: string[] = [];
    const counted: ColumnLinksSource<FakeNode> = {
      ...source,
      lastRunOf: (blockId) => {
        reads.push(blockId);
        return source.lastRunOf(blockId);
      },
    };

    expect(computeDependencies(counted, "x").items.map((item) => item.status)).toEqual([ok, ok]);
    expect(jsonReads.count).toBe(1);
    expect(reads).toEqual(["samples"]);
  });

  test("only the fields of the referenced columns are read from the run", () => {
    run([
      {
        id: "samples",
        args: {},
        prodCtx: frame({ condition: column({ cells: ["treated"] }), donor: column() }),
      },
      { id: "x", args: { target: pick("treated") } },
    ]);

    expect(new Set(fieldReads)).toEqual(new Set(["condition.spec", "condition.data"]));
  });

  test("a producer whose run results failed to render is unavailable", () => {
    const { links } = run([
      { id: "samples", args: {}, prodFailed: true },
      { id: "x", args: { condition: createPlRef("samples", "condition") } },
    ]);

    expect(statuses(links.x)).toEqual([unavailable]);
    expect(statuses(links.samples, "dependents")).toEqual([
      { type: "broken", reason: "notExported" },
    ]);
  });

  test("the args of no other block are read", () => {
    const { source } = run([
      { id: "samples", args: {}, prodCtx: frame({ condition: column() }) },
      { id: "x", args: { condition: pick("a") } },
      { id: "y", args: { condition: pick("a") } },
    ]);
    const reads: string[] = [];
    const counted: ColumnLinksSource<FakeNode> = {
      ...source,
      argsOf: (blockId, which) => {
        reads.push(blockId);
        return source.argsOf(blockId, which);
      },
      referencesOf: (blockId, which) => {
        reads.push(blockId);
        return source.referencesOf(blockId, which);
      },
    };

    computeDependencies(counted, "x");

    expect(new Set(reads)).toEqual(new Set(["x"]));
  });

  test("values of a column whose data is not JSON are unchecked as unreadable", () => {
    const { links } = run([
      { id: "samples", args: {}, prodCtx: frame({ condition: binaryColumn() }) },
      { id: "x", args: { condition: pick("treated") } },
    ]);

    expect(statuses(links.x)).toEqual([unreadable]);
  });

  test("values of JSON data not ready yet are pending; of data that failed, unreadable", () => {
    const linksOf = (data: FakeNode) =>
      run([
        { id: "samples", args: {}, prodCtx: frame({ condition: { spec: SPEC, data } }) },
        { id: "x", args: { condition: pick("treated") } },
      ]).links.x;

    expect(statuses(linksOf(jsonNode({ data: {} }, { ready: false })))).toEqual([
      { type: "pending" },
    ]);
    expect(statuses(linksOf(jsonNode({ data: {} }, { error: "failed" })))).toEqual([unreadable]);
  });
});

describe("computeDependents", () => {
  test("the args of the blocks above the block are not read", () => {
    const { source } = run([
      { id: "above", args: { condition: pick("a") } },
      { id: "samples", args: {}, prodCtx: frame({ condition: column() }) },
      { id: "below", args: { condition: pick("a") } },
    ]);
    const reads: string[] = [];
    const counted: ColumnLinksSource<FakeNode> = {
      ...source,
      referencesOf: (blockId, which) => {
        reads.push(blockId);
        return source.referencesOf(blockId, which);
      },
    };

    expect(computeDependents(counted, "samples").items).toMatchObject([
      { dependentBlockId: "below" },
    ]);
    expect(reads).toEqual(["below"]);
  });

  test("a block not in the project has no dependents and runs against no block", () => {
    const { source } = run([{ id: "samples", args: {}, prodCtx: frame({ condition: column() }) }]);
    const args = { condition: pick("a") };
    const gone: ColumnLinksSource<FakeNode> = {
      ...source,
      argsOf: () => args,
      referencesOf: () => collectColumnReferences(args),
    };

    expect(computeDependents(gone, "gone").items).toEqual([]);
    expect(computeDependencies(gone, "gone").items).toMatchObject([{ status: unavailable }]);
  });

  test("a block nobody references has no dependents", () => {
    const { links } = run([{ id: "samples", args: {}, lastRunArgs: {}, prodCtx: frame({}) }]);

    expect(links.samples.dependents).toEqual({ items: [], hasUnrunChanges: false });
  });

  test("changes of the block its last run does not include are reported", () => {
    const unrun = (args: unknown, lastRunArgs: unknown) =>
      run([{ id: "samples", args, lastRunArgs }]).links.samples.dependents.hasUnrunChanges;

    expect(unrun({ metadata: ["treated"] }, { metadata: ["treated"] })).toBe(false);
    expect(unrun({ metadata: ["treated", "control"] }, { metadata: ["treated"] })).toBe(true);
    expect(unrun(undefined, { metadata: ["treated"] })).toBe(false);
  });

  test("a reference to an output the block does not export is broken as notExported", () => {
    const { links } = run([
      { id: "samples", args: {}, prodCtx: frame({}) },
      { id: "below", args: { condition: pick("treated") } },
    ]);

    expect(statuses(links.samples, "dependents")).toEqual([
      { type: "broken", reason: "notExported" },
    ]);
  });

  test("an output the block's run does not export takes its label from the prepared results", () => {
    const { links } = run([
      { id: "samples", args: {}, prodCtx: frame({}), stagingCtx: frame({ condition: column() }) },
      { id: "below", args: { condition: pick("treated") } },
    ]);

    expect(links.samples.dependents.items).toMatchObject([
      { columnLabel: "Condition", status: { type: "broken", reason: "notExported" } },
    ]);
  });

  test("a reference to values that cannot be read is unchecked as unreadable", () => {
    const { links } = run([
      { id: "samples", args: {}, prodCtx: frame({ condition: binaryColumn() }) },
      { id: "below", args: { condition: pick("treated") } },
    ]);

    expect(statuses(links.samples, "dependents")).toEqual([unreadable]);
  });

  test("a reference to an output of a run still rendering is pending", () => {
    const { links } = run([
      { id: "samples", args: {}, prodIncomplete: true },
      { id: "below", args: { condition: createPlRef("samples", "condition") } },
    ]);

    expect(statuses(links.samples, "dependents")).toEqual([{ type: "pending" }]);
  });

  test("values the dependent picked and the block's output lacks are listed", () => {
    const { links } = run([
      {
        id: "samples",
        args: {},
        lastRunArgs: {},
        prodCtx: frame({ condition: column({ cells: ["treated"] }) }),
      },
      { id: "below", args: { levels: [pick("treated"), pick("control")] } },
      { id: "other", args: { condition: createPlRef("samples", "condition") } },
    ]);

    expect(links.samples.dependents).toEqual({
      items: [
        {
          dependentBlockId: "below",
          output: "condition",
          ref: condition,
          values: ["treated", "control"],
          columnLabel: "Condition",
          status: { type: "missingValues", values: ["control"] },
        },
        {
          dependentBlockId: "other",
          output: "condition",
          ref: condition,
          values: null,
          columnLabel: "Condition",
          status: ok,
        },
      ],
      hasUnrunChanges: false,
    });
  });

  test("dependents come in project order, then in the order the args hold them", () => {
    const { links } = run([
      {
        id: "samples",
        args: {},
        prodCtx: frame({ condition: column({ cells: ["ctrl"] }), donor: column() }),
      },
      { id: "a", args: { x: pick("d1", donor), y: condition } },
      { id: "b", args: { y: pick("ctrl"), z: donor } },
    ]);

    expect(
      links.samples.dependents.items.map((item) => [item.dependentBlockId, item.ref, item.values]),
    ).toEqual([
      ["a", donor, ["d1"]],
      ["a", condition, null],
      ["b", condition, ["ctrl"]],
      ["b", donor, null],
    ]);
  });

  test("a column local to the dependent block is not a reference to another block", () => {
    const local = createLocalPObjectId(["outputs", "table"], "condition");
    const { links } = run([
      { id: "samples", args: {}, prodCtx: frame({ condition: column() }) },
      { id: "x", args: { column: local, target: pick("x", local) } },
    ]);

    expect(links.x.dependencies.items).toEqual([]);
    expect(links.samples.dependents.items).toEqual([]);
  });

  test("a removed dependent block disappears", () => {
    const samples: FakeBlock = { id: "samples", args: {}, prodCtx: frame({ condition: column() }) };
    const below: FakeBlock = { id: "below", args: { target: pick("ctrl") } };

    expect(run([samples, below]).links.samples.dependents.items).toHaveLength(1);
    expect(run([samples]).links.samples.dependents.items).toEqual([]);
  });

  test("duplicated blocks with identical args are each listed, in project order", () => {
    const args = { target: pick("ctrl") };
    const { links } = run([
      { id: "samples", args: {}, prodCtx: frame({ condition: column({ cells: ["ctrl"] }) }) },
      { id: "copy1", args },
      { id: "copy2", args: structuredClone(args) },
    ]);

    expect(links.samples.dependents.items.map((item) => item.dependentBlockId)).toEqual([
      "copy1",
      "copy2",
    ]);
  });

  test("a malformed id in one block does not hide the references of another", () => {
    // The marker of a filtered column with no source to resolve to a leaf.
    const malformedColumn = '{"__isFiltered":true}';
    const malformedValue = canonicalizeJson({
      __isColumnValue: true,
      column: malformedColumn,
      value: "ctrl",
    });
    const { links } = run([
      { id: "samples", args: {}, prodCtx: frame({ condition: column(), donor: column() }) },
      { id: "broken", args: { column: malformedColumn, target: malformedValue, ok: donor } },
      { id: "enrichment", args: { target: pick("treated") } },
    ]);

    expect(links.samples.dependents.items).toMatchObject([
      { dependentBlockId: "broken", ref: donor, values: null },
      { dependentBlockId: "enrichment", values: ["treated"] },
    ]);
  });

  test("a block applied from a template references the block its entry became", () => {
    const tplArgs = {
      input: createPlRef("tpl-samples", "donor"),
      target: pick("ctrl", createGlobalPObjectId("tpl-samples", "condition")),
    };
    const args = relocateBlockIds(tplArgs, new Map([["tpl-samples", "samples"]]));
    const { links } = run([
      { id: "samples", args: {}, prodCtx: frame({ condition: column(), donor: column() }) },
      { id: "enrichment", args },
    ]);

    expect(links.samples.dependents.items).toMatchObject([
      { dependentBlockId: "enrichment", output: "donor", ref: donor, values: null },
      { dependentBlockId: "enrichment", output: "condition", ref: condition, values: ["ctrl"] },
    ]);
  });
});

describe("labelColumnLinks", () => {
  test("labels the blocks each side names, leaving out those that cannot be labelled", () => {
    const { links } = run([
      { id: "samples", args: {}, prodCtx: frame({ condition: column({ cells: ["ctrl"] }) }) },
      { id: "x", args: { target: pick("ctrl"), gone: pick("a", gone) } },
      { id: "y", args: { target: pick("ctrl") } },
    ]);
    const labelOf = (blockId: string) => {
      if (blockId === "y" || blockId === "deleted") throw new Error(`no label for ${blockId}`);
      return `Label of ${blockId}`;
    };

    expect(labelColumnLinks(links.x, labelOf).dependencies.labels).toEqual({
      samples: "Label of samples",
    });
    expect(labelColumnLinks(links.samples, labelOf).dependents.labels).toEqual({
      x: "Label of x",
    });
  });
});

// Internals

const ok = { type: "ok" };
const unavailable = { type: "broken", reason: "unavailable" };
const unreadable = { type: "unchecked", reason: "unreadable" };
const gone = createGlobalPObjectId("deleted", "condition");

const SPEC: PColumnSpec = {
  kind: "PColumn",
  name: "condition",
  valueType: "String",
  axesSpec: [{ name: "sample", type: "String" }],
  annotations: { [Annotation.Label]: "Condition" },
};

/** Reads of JSON column data, across every node of a test. */
const jsonReads = { count: 0 };

/** Fields read from the nodes of a test, in order. */
const fieldReads: string[] = [];

/** A resource of the fake project tree. */
class FakeNode implements ExportNode<FakeNode> {
  readonly resourceType: { readonly name: string };

  constructor(
    type: string,
    private readonly props: {
      fields: ReadonlyMap<string, undefined | FakeNode>;
      locked: boolean;
      content: undefined | string;
      ready: boolean;
      error: undefined | string;
    },
  ) {
    this.resourceType = { name: type };
  }

  traverse(step: ColumnFieldStep): FakeNode | undefined {
    fieldReads.push(step.field);
    return this.props.fields.get(step.field);
  }

  getInputsLocked(): boolean {
    return this.props.locked;
  }

  hasData(): boolean {
    return this.props.content !== undefined;
  }

  getIsReadyOrError(): boolean {
    return this.props.ready;
  }

  getError(): unknown {
    return this.props.error;
  }

  getDataAsJson<T = unknown>(): T | undefined {
    if (this.props.content === undefined) return undefined;
    if (this.resourceType.name === "PColumnData/Json") jsonReads.count++;
    return JSON.parse(this.props.content);
  }
}

type ColumnFixture = { spec: undefined } | { spec: PColumnSpec; data: undefined | FakeNode };

/** A result list exporting the given columns. */
function frame(
  columns: Record<string, ColumnFixture>,
  options: { locked: boolean } = { locked: true },
): FakeNode {
  const fields = new Map<string, undefined | FakeNode>();
  for (const [name, fixture] of Object.entries(columns)) {
    fields.set(
      `${name}.spec`,
      fixture.spec === undefined ? undefined : valueNode("Spec", fixture.spec),
    );
    if ("data" in fixture && fixture.data !== undefined) fields.set(`${name}.data`, fixture.data);
  }
  return new FakeNode("PFrame", {
    fields,
    locked: options.locked,
    content: undefined,
    ready: true,
    error: undefined,
  });
}

/** A column with JSON data holding `cells`, one per sample. */
function column(options: { cells: string[]; spec?: PColumnSpec } = { cells: [] }): ColumnFixture {
  const data = Object.fromEntries(options.cells.map((cell, i) => [`["s${i}"]`, cell]));
  return { spec: options.spec ?? SPEC, data: jsonNode({ keyLength: 1, data }) };
}

/** A column whose data is binary, which cannot be read. */
function binaryColumn(): ColumnFixture {
  return { spec: SPEC, data: valueNode("PColumnData/Binary", {}) };
}

function jsonNode(
  value: unknown,
  options: { ready: boolean } | { error: string } = { ready: true },
): FakeNode {
  const failed = "error" in options;
  return new FakeNode("PColumnData/Json", {
    fields: new Map(),
    locked: true,
    content: failed ? undefined : JSON.stringify(value),
    ready: failed || options.ready,
    error: failed ? options.error : undefined,
  });
}

function valueNode(type: string, value: unknown): FakeNode {
  return new FakeNode(type, {
    fields: new Map(),
    locked: true,
    content: JSON.stringify(value),
    ready: true,
    error: undefined,
  });
}

/** A block of the fake project: its args and the results of its last run and of its staging. */
type FakeBlock = {
  id: string;
  args?: unknown;
  lastRunArgs?: unknown;
  /** The results of the last run: a block with none of these has no last run. */
  prodCtx?: FakeNode;
  prodIncomplete?: true;
  prodFailed?: true;
  stagingCtx?: FakeNode;
};

/** Column links of a project holding `blocks` in this order, with what was read to get them. */
function run(blocks: FakeBlock[]): {
  links: Record<string, UnlabeledColumnLinks>;
  source: ColumnLinksSource<FakeNode>;
  reads: string[];
} {
  const reads: string[] = [];
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const blockOf = (blockId: string): FakeBlock => {
    const block = byId.get(blockId);
    if (block === undefined) throw new Error(`Block ${blockId} is not in the project`);
    return block;
  };
  const argsOf = (blockId: string, which: "current" | "lastRun") =>
    which === "current" ? blockOf(blockId).args : blockOf(blockId).lastRunArgs;
  const source: ColumnLinksSource<FakeNode> = {
    blockIds: blocks.map((block) => block.id),
    argsOf,
    referencesOf: (blockId, which) => {
      reads.push(`${blockId}:references:${which}`);
      const args = argsOf(blockId, which);
      return args === undefined ? [] : collectColumnReferences(args);
    },
    lastRunOf: (blockId) => {
      reads.push(`${blockId}:prod`);
      const { prodCtx, prodIncomplete, prodFailed } = blockOf(blockId);
      if (prodCtx !== undefined) return { type: "rendered", ctx: prodCtx };
      if (prodIncomplete) return { type: "rendering" };
      if (prodFailed) return { type: "failed" };
      return { type: "notRun" };
    },
    stagingOf: (blockId) => {
      reads.push(`${blockId}:staging`);
      return blockOf(blockId).stagingCtx;
    },
  };
  const links = Object.fromEntries(
    blocks.map(({ id }): [string, UnlabeledColumnLinks] => [
      id,
      { dependencies: computeDependencies(source, id), dependents: computeDependents(source, id) },
    ]),
  );
  return { links, source, reads };
}

function statuses(
  links: UnlabeledColumnLinks,
  side: "dependencies" | "dependents" = "dependencies",
): unknown[] {
  return links[side].items.map((item) => item.status);
}
