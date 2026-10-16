import type { AxisSpec, PColumnSpec, PObjectId } from "@platforma-sdk/model";
import { randomUUID } from "node:crypto";
import * as fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { ColumnRow, ListedColumn } from "./pframe-read";
import type { ColumnSource } from "./recording";
import {
  diffRecordings,
  expectRecording,
  readRecording,
  recordColumns,
  recordedDataset,
  recordingShape,
  writeRecording,
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
  return { columns, readById: async (id) => cols[id as string].rows };
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

  test("round-trips through the folder", async () => {
    const dir = path.join(os.tmpdir(), `rec-${randomUUID()}`);
    const rec = await recordColumns(SRC(), { scenario: "s", blockId: "b1" });
    await writeRecording(dir, rec);
    const back = await readRecording(dir);
    expect(back.axes).toEqual(rec.axes);
    expect(back.columns).toEqual(rec.columns);
    // An undefined cell is absent after the round trip, which is the same for the diff.
    expect(back.rows).toEqual(rec.rows.map((r) => JSON.parse(JSON.stringify(r))));
    expect(diffRecordings(rec, back)).toEqual([]);
    await fsp.rm(dir, { recursive: true });
  });
});

describe("empty strings", () => {
  test("record as NA, so a recording matches its own round trip", async () => {
    const dir = path.join(os.tmpdir(), `rec-${randomUUID()}`);
    const rec = await recordColumns(
      source({
        x: {
          spec: spec("pl7.app/label", [CLONE]),
          rows: [
            { keys: ["a"], value: "" },
            { keys: ["b"], value: "v" },
          ],
        },
      }),
      { scenario: "s" },
    );
    await writeRecording(dir, rec);
    expect(diffRecordings(await readRecording(dir), rec)).toEqual([]);
    await fsp.rm(dir, { recursive: true });
  });
});

describe("file column names", () => {
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
});

describe("diffRecordings", () => {
  test("names changed values, missing rows and missing columns", async () => {
    const expected = await recordColumns(SRC(), { scenario: "s", blockId: "b1" });
    const changed = source({
      link: {
        spec: spec("pl7.app/link", [CLUSTER, CLONE], "Int"),
        rows: [
          { keys: ["A", "c1"], value: 1 },
          { keys: ["B", "c3"], value: 2 },
        ],
      },
      size: {
        spec: spec("pl7.app/clustering/clusterSize", [CLUSTER], "Int"),
        rows: [
          { keys: ["A"], value: 2 },
          { keys: ["B"], value: 1 },
          { keys: ["C"], value: 0 },
        ],
      },
    });
    const actual = await recordColumns(changed, { scenario: "s", blockId: "b1" });
    const diff = diffRecordings(expected, actual);
    expect(diff).toEqual([
      "column label: missing from the run",
      "column link: 3 rows -> 2",
      "column link: 1 rows missing: A|c2",
      "column link: 1 values changed: B|c3: 1 -> 2",
    ]);
  });

  test("a dropped row is reported where another column keeps the joined row", async () => {
    const expected = await recordColumns(SRC(), { scenario: "s", blockId: "b1" });
    const actual = JSON.parse(JSON.stringify(expected));
    actual.columns.find((c: { column: string }) => c.column === "label").rows = 2;
    expect(diffRecordings(expected, actual)).toEqual(["column label: 3 rows -> 2"]);
  });

  test("axis keys holding the join character stay apart", async () => {
    const rec = (value: number) =>
      recordColumns(
        source({
          v: {
            spec: spec("pl7.app/v", [CLUSTER, CLONE], "Int"),
            rows: [
              { keys: ["a|b", "c"], value: 1 },
              { keys: ["a", "b|c"], value },
            ],
          },
        }),
        { scenario: "s", blockId: "b1" },
      );
    expect(diffRecordings(await rec(1), await rec(2))).toEqual([
      "column v: 1 values changed: a|b|c: 1 -> 2",
    ]);
  });

  test("equal NaN and infinite values match", async () => {
    const expected = await recordColumns(SRC(), { scenario: "s", blockId: "b1" });
    expected.rows[0].clusterSize = Number.NaN;
    expected.rows[1].clusterSize = Number.POSITIVE_INFINITY;
    const actual = JSON.parse(JSON.stringify(expected));
    actual.rows[0].clusterSize = Number.NaN;
    actual.rows[1].clusterSize = Number.POSITIVE_INFINITY;
    expect(diffRecordings(expected, actual, { tolerance: { clusterSize: 0.1 } })).toEqual([]);
  });
});

describe("axis identity", () => {
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
    expect(rec.columns.find((c) => c.column === "link")!.parentAxes).toEqual([0, 1]);
    expect(rec.columns.find((c) => c.column === "u")!.parentAxes).toEqual([2]);
    expect(rec.columns.find((c) => c.column === "w")!.parentAxes).toEqual([2]);
    expect(() => recordingShape(rec)).toThrow(/axis clonotypeKey/);
  });

  test("a changed spec is reported even when the rows match", async () => {
    const expected = await recordColumns(SRC(), { scenario: "s", blockId: "b1" });
    const actual = JSON.parse(JSON.stringify(expected));
    actual.columns[0].spec.annotations["pl7.app/label"] = "Size";
    expect(diffRecordings(expected, actual)[0]).toMatch(/^column clusterSize: spec changed/);
  });

  test("a tolerance absorbs small numeric drift", async () => {
    const expected = await recordColumns(SRC(), { scenario: "s", blockId: "b1" });
    const actual = JSON.parse(JSON.stringify(expected));
    actual.rows[0].clusterSize = 2.0004;
    expect(diffRecordings(expected, actual)).toHaveLength(1);
    expect(diffRecordings(expected, actual, { tolerance: { clusterSize: 0.001 } })).toEqual([]);
  });
});

describe("expectRecording", () => {
  test("adding a same-name column is not a dropped column", async () => {
    const dir = path.join(os.tmpdir(), `rec-${randomUUID()}`);
    const seq = (content: string) =>
      spec("pl7.app/vdj/sequence", [CLUSTER], "String", {
        "pl7.app/clustering/sequenceContent": content,
      });
    const ref = { spec: seq("referenceCentroid"), rows: [{ keys: ["A"], value: "X" }] };
    const opts = { scenario: "s", blockId: "b1", dir, update: true };
    await expectRecording(source({ a: ref }), opts);
    const rec = await expectRecording(
      source({ a: ref, b: { spec: seq("centroid"), rows: [{ keys: ["A"], value: "Y" }] } }),
      opts,
    );
    expect(rec.columns).toHaveLength(2);
    await expect(
      expectRecording(source({ b: { spec: seq("centroid"), rows: [] } }), opts),
    ).rejects.toThrow(/would drop columns/);
    await fsp.rm(dir, { recursive: true });
  });
});

describe("recordedDataset", () => {
  test("publishes under the same identities, axes skipping rows they are absent from", async () => {
    const dir = path.join(os.tmpdir(), `rec-${randomUUID()}`);
    await writeRecording(dir, await recordColumns(SRC(), { scenario: "s", blockId: "b1" }));
    const ds = await recordedDataset(dir, { blockId: "publisher" });
    const shape = recordingShape(ds.recording, { blockId: "publisher" });
    expect(shape.axes.map((a) => a.filterOutRegex)).toEqual(["^$", "^$"]);
    expect(shape.axes[0].spec.domain).toEqual({ "pl7.app/clustering/blockId": "publisher" });
    expect(ds.recording.axes[0].spec.domain).toEqual({
      "pl7.app/clustering/blockId": "{{blockId}}",
    });
    expect(ds.spec.columns.map((c) => c.payload.spec.parentAxes)).toEqual([[0], [1], [0, 1]]);
    expect(ds.content.split("\n")[0]).toBe("clusterId\tclonotypeKey\tclusterSize\tlabel\tlink");
    expect(ds.content.split("\n")[4]).toBe("C\t\t0\t\t");
    await fsp.rm(dir, { recursive: true });
  });
});
