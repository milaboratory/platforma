import type { AxisSpec, PColumnSpec, PObjectId } from "@platforma-sdk/model";
import { randomUUID } from "node:crypto";
import * as fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { ColumnRow, ListedColumn } from "./pframe-read";
import type { ColumnSource, Recording } from "./recording";
import {
  DATA_FILE,
  MANIFEST_FILE,
  expectRecording,
  recordColumns,
  recordedDataset,
  recordingShape,
  renderRecording,
} from "./recording";

const CLUSTER: AxisSpec = {
  name: "pl7.app/clusterId",
  type: "String",
  domain: { "pl7.app/clustering/blockId": "b1" },
};
const CLONE: AxisSpec = { name: "pl7.app/vdj/clonotypeKey", type: "String" };

type Col = { spec: PColumnSpec; rows: ColumnRow[] };

function source(cols: Record<string, Col>): ColumnSource {
  const columns: ListedColumn[] = Object.entries(cols).map(([id, c]) => ({
    columnId: id as PObjectId,
    spec: c.spec,
  }));
  return { columns, readById: async (id) => cols[id].rows };
}

const spec = (
  name: string,
  axes: AxisSpec[],
  valueType = "String",
  domain?: Record<string, string>,
): PColumnSpec =>
  ({
    kind: "PColumn",
    name,
    valueType,
    axesSpec: axes,
    domain,
    annotations: { "pl7.app/label": name },
  }) as PColumnSpec;

const SRC = () =>
  source({
    link: {
      spec: spec("pl7.app/link", [CLUSTER, CLONE], "Int"),
      rows: [
        { keys: ["A", "c1"], value: 1 },
        { keys: ["A", "c2"], value: 1 },
        { keys: ["B", "c3"], value: 1 },
      ],
    },
    size: {
      spec: spec("pl7.app/clustering/clusterSize", [CLUSTER], "Int"),
      rows: [
        { keys: ["A"], value: 2 },
        { keys: ["B"], value: 1 },
        // A cluster no linker row carries: gets a row of its own.
        { keys: ["C"], value: 0 },
      ],
    },
    label: {
      spec: spec("pl7.app/label", [CLONE]),
      rows: [
        { keys: ["c1"], value: "x" },
        { keys: ["c2"], value: null },
        { keys: ["c3"], value: "z" },
      ],
    },
  });

const tmpDir = () => path.join(os.tmpdir(), `rec-${randomUUID()}`);

async function write(dir: string, rec: Recording) {
  await fsp.mkdir(dir, { recursive: true });
  for (const [name, text] of Object.entries(renderRecording(rec)))
    await fsp.writeFile(path.join(dir, name), text);
}

describe("recordColumns", () => {
  test("joins columns on the union of their axes, widest first", async () => {
    const rec = await recordColumns(SRC(), { scenario: "s", blockId: "b1" });
    expect(rec.axes.map((a) => a.column)).toEqual(["clusterId", "clonotypeKey"]);
    // The run's own id is tokenized, so a second run records the same specs.
    expect(rec.axes[0].spec.domain).toEqual({ "pl7.app/clustering/blockId": "{{blockId}}" });
    expect(rec.columns.map((c) => [c.column, c.parentAxes, c.rows])).toEqual([
      ["clusterSize", [0], 3],
      ["label", [1], 3],
      ["link", [0, 1], 3],
    ]);
    expect(rec.rows).toEqual([
      { clusterId: "A", clonotypeKey: "c1", link: 1, clusterSize: 2, label: "x" },
      { clusterId: "A", clonotypeKey: "c2", link: 1, clusterSize: 2, label: undefined },
      { clusterId: "B", clonotypeKey: "c3", link: 1, clusterSize: 1, label: "z" },
      { clusterId: "C", clusterSize: 0 },
    ]);
  });

  test("two columns of one name are told apart by their domain", async () => {
    const seq = (content: string) =>
      spec("pl7.app/vdj/sequence", [CLUSTER], "String", {
        "pl7.app/clustering/sequenceContent": content,
      });
    const rec = await recordColumns(
      source({
        a: { spec: seq("referenceCentroid"), rows: [{ keys: ["A"], value: "X" }] },
        b: { spec: seq("centroid"), rows: [{ keys: ["A"], value: "Y" }] },
      }),
      { scenario: "s", blockId: "b1" },
    );
    expect(rec.columns.map((c) => c.column)).toEqual(["sequence", "sequence_referenceCentroid"]);
  });

  test("columns differing only in value type keep their file names in any input order", async () => {
    const cols = {
      s: { spec: spec("pl7.app/x", [CLONE], "String"), rows: [{ keys: ["k"], value: "a" }] },
      i: { spec: spec("pl7.app/x", [CLONE], "Int"), rows: [{ keys: ["k"], value: 1 }] },
    };
    const names = async (order: ("s" | "i")[]) =>
      (
        await recordColumns(source(Object.fromEntries(order.map((k) => [k, cols[k]]))), {
          scenario: "s",
        })
      ).columns.map((c) => [c.column, c.spec.valueType]);
    expect(await names(["s", "i"])).toEqual(await names(["i", "s"]));
  });

  test("axis tuples a joined key would merge stay separate rows", async () => {
    const rec = await recordColumns(
      source({
        v: {
          spec: spec("pl7.app/v", [CLUSTER, CLONE], "Int"),
          rows: [
            { keys: ["a\u0000b", "c"], value: 1 },
            { keys: ["a", "b\u0000c"], value: 2 },
          ],
        },
      }),
      { scenario: "s", blockId: "b1" },
    );
    expect(rec.rows.map((r) => r.v)).toEqual([2, 1]);
  });

  test("axes differing only in contextDomain stay apart; key order does not split them", async () => {
    const left: AxisSpec = { ...CLONE, contextDomain: { side: "left" } };
    const right: AxisSpec = { ...CLONE, contextDomain: { side: "right" } };
    const a: AxisSpec = { ...CLONE, domain: { x: "1", y: "2" } };
    const b: AxisSpec = { ...CLONE, domain: { y: "2", x: "1" } };
    const rec = await recordColumns(
      source({
        link: {
          spec: spec("pl7.app/link", [left, right], "Int"),
          rows: [{ keys: ["p", "q"], value: 1 }],
        },
        u: { spec: spec("pl7.app/u", [a], "Int"), rows: [{ keys: ["k"], value: 1 }] },
        w: { spec: spec("pl7.app/w", [b], "Int"), rows: [{ keys: ["k"], value: 2 }] },
      }),
      { scenario: "s" },
    );
    expect(rec.axes).toHaveLength(3);
    expect(rec.columns.find((c) => c.column === "link")?.parentAxes).toEqual([0, 1]);
    expect(rec.columns.find((c) => c.column === "u")?.parentAxes).toEqual([2]);
    expect(rec.columns.find((c) => c.column === "w")?.parentAxes).toEqual([2]);
  });

  test("digits rounds numeric values", async () => {
    const rec = await recordColumns(
      source({
        v: {
          spec: spec("pl7.app/v", [CLONE], "Double"),
          rows: [{ keys: ["k"], value: 0.0833333358168602 }],
        },
      }),
      { scenario: "s", digits: 6 },
    );
    expect(rec.rows[0].v).toBe(0.0833333);
  });
});

describe("renderRecording", () => {
  test("renders the same files whatever the key order of specs and JSON annotations", async () => {
    const trace = (json: string): Col => ({
      spec: { ...spec("pl7.app/v", [CLONE], "Int"), annotations: { "pl7.app/trace": json } },
      rows: [{ keys: ["k"], value: 1 }],
    });
    const render = async (json: string) =>
      renderRecording(await recordColumns(source({ v: trace(json) }), { scenario: "s" }));
    expect(await render('{"a":1,"b":2}')).toEqual(await render('{"b":2,"a":1}'));
  });

  test("an NA and an empty string render alike", async () => {
    const rec = (value: string | null) =>
      recordColumns(
        source({ x: { spec: spec("pl7.app/label", [CLONE]), rows: [{ keys: ["a"], value }] } }),
        { scenario: "s" },
      );
    expect(renderRecording(await rec(""))).toEqual(renderRecording(await rec(null)));
  });
});

describe("expectRecording", () => {
  test("passes against the files the same run renders", async () => {
    const dir = tmpDir();
    await write(dir, await recordColumns(SRC(), { scenario: "s", blockId: "b1" }));
    await expectRecording(SRC(), { scenario: "s", blockId: "b1", dir, expect });
    await fsp.rm(dir, { recursive: true });
  });
});

describe("recordedDataset", () => {
  test("publishes data.tsv as it is, each axis and column skipping its empty cells", async () => {
    const dir = tmpDir();
    await write(dir, await recordColumns(SRC(), { scenario: "s", blockId: "b1" }));
    const ds = await recordedDataset(dir);
    expect(ds.content).toBe(await fsp.readFile(path.join(dir, DATA_FILE), "utf8"));
    expect(ds.shape.axes.map((a) => a.filterOutRegex)).toEqual(["^$", "^$"]);
    expect(ds.shape.columns.map((c) => c.filterOutRegex)).toEqual(["^$", "^$", "^$"]);
    expect(ds.shape.axes[0].spec.domain).toEqual({
      "pl7.app/clustering/blockId": "recorded-upstream",
    });
    expect(ds.spec.columns.map((c) => c.payload.spec.parentAxes)).toEqual([[0], [1], [0, 1]]);
    expect(ds.content.split("\n")[0]).toBe("clusterId\tclonotypeKey\tclusterSize\tlabel\tlink");
    expect(ds.content.split("\n")[4]).toBe("C\t\t0\t\t");
    await fsp.rm(dir, { recursive: true });
  });

  test("rejects a data.tsv whose header does not match its manifest", async () => {
    const dir = tmpDir();
    await write(dir, await recordColumns(SRC(), { scenario: "s" }));
    const file = path.join(dir, DATA_FILE);
    const tsv = await fsp.readFile(file, "utf8");
    await fsp.writeFile(file, tsv.replace("label", "renamed"));
    await expect(recordedDataset(dir)).rejects.toThrow(/has header/);
    await fsp.rm(dir, { recursive: true });
  });

  test("rejects a manifest of another version", async () => {
    const dir = tmpDir();
    await write(dir, await recordColumns(SRC(), { scenario: "s" }));
    const file = path.join(dir, MANIFEST_FILE);
    const manifest = JSON.parse(await fsp.readFile(file, "utf8"));
    await fsp.writeFile(file, JSON.stringify({ ...manifest, version: 2 }));
    await expect(recordedDataset(dir)).rejects.toThrow(/version 2/);
    await fsp.rm(dir, { recursive: true });
  });
});

describe("recordingShape", () => {
  test("rejects what xsv-import cannot publish", async () => {
    const withAxisContext = await recordColumns(
      source({
        v: {
          spec: spec("pl7.app/v", [{ ...CLONE, contextDomain: { side: "left" } }], "Int"),
          rows: [{ keys: ["k"], value: 1 }],
        },
      }),
      { scenario: "s" },
    );
    expect(() => recordingShape(withAxisContext)).toThrow(/axis clonotypeKey/);
    const withColumnParents = await recordColumns(
      source({
        v: {
          spec: { ...spec("pl7.app/v", [CLUSTER, CLONE], "Int"), parentAxes: [0] },
          rows: [{ keys: ["A", "k"], value: 1 }],
        },
      }),
      { scenario: "s" },
    );
    expect(() => recordingShape(withColumnParents)).toThrow(/column v/);
  });
});
