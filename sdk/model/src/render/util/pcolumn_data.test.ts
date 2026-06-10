import { afterEach, expect, test, vi } from "vitest";
import type {
  DataInfo,
  ParquetChunkMetadata,
  PColumnValues,
} from "@milaboratories/pl-model-common";
import * as internal from "../../internal";
import type { AccessorHandle } from "../internal";
import { TreeNodeAccessor } from "../accessor";
import {
  getNumberOfRows,
  RT_JSON_PARTITIONED,
  RT_PARQUET_PARTITIONED,
  RT_PARQUET_SUPER_PARTITIONED,
} from "./pcolumn_data";

type RenderCtx = ReturnType<typeof internal.getCfgRenderCtx>;

/**
 * Fake resource in a mocked resource tree.
 * - `type`   — resource type name (e.g. {@link RT_PARQUET_PARTITIONED}).
 * - `data`   — the resource's own JSON payload (what `getDataAsString` returns).
 *              For a ParquetChunk resource this is the {@link ParquetChunkMetadata}.
 * - `fields` — input fields: stringified partition key → child handle.
 * - `ready`  — readiness flag (default true).
 */
type FakeResource = {
  type: string;
  data?: unknown;
  fields?: Record<string, string>;
  ready?: boolean;
};

/**
 * Builds a handle-dispatched render context over a fake resource tree, so a
 * `TreeNodeAccessor` rooted at `topHandle` walks real partition fields and reads
 * real chunk metadata — the same path a parquet PColumn takes at runtime.
 */
function accessorOver(tree: Record<string, FakeResource>, topHandle: string): TreeNodeAccessor {
  const get = (h: AccessorHandle): FakeResource => {
    const r = tree[h as string];
    if (r === undefined) throw new Error(`no fake resource for handle ${String(h)}`);
    return r;
  };
  const ctx: Partial<RenderCtx> = {
    getIsReadyOrError: (h) => get(h).ready ?? true,
    getError: () => undefined,
    getResourceType: (h) => ({ name: get(h).type, version: "1" }),
    getInputsLocked: () => true,
    getDataAsString: (h) => {
      const data = get(h).data;
      return data === undefined ? undefined : JSON.stringify(data);
    },
    listInputFields: (h) => Object.keys(get(h).fields ?? {}),
    resolveWithCommon: (h, _common, ...steps) => {
      const step = steps[0];
      const field = typeof step === "string" ? step : step.field;
      return get(h).fields?.[field] as AccessorHandle | undefined;
    },
  };
  vi.spyOn(internal, "getCfgRenderCtx").mockReturnValue(ctx as RenderCtx);
  return new TreeNodeAccessor(topHandle as AccessorHandle, []);
}

/** Realistic ParquetChunk resource payload with a row count. */
function chunkMeta(numberOfRows: number): ParquetChunkMetadata {
  return {
    dataDigest: `digest-${numberOfRows}`,
    stats: {
      numberOfRows,
      size: { axes: [8 * numberOfRows], column: 4 * numberOfRows },
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("getNumberOfRows sums chunk row counts for a real parquet partitioned column", () => {
  // Tree: ParquetPartitioned root with two partition fields, each pointing at a
  // ParquetChunk resource whose own JSON payload carries stats.numberOfRows.
  const acc = accessorOver(
    {
      top: {
        type: RT_PARQUET_PARTITIONED,
        data: { partitionKeyLength: 1 },
        fields: { '["s1"]': "chunkA", '["s2"]': "chunkB" },
      },
      chunkA: { type: "PColumnData/ParquetChunk", data: chunkMeta(100) },
      chunkB: { type: "PColumnData/ParquetChunk", data: chunkMeta(50) },
    },
    "top",
  );

  expect(getNumberOfRows(acc)).toBe(150);
});

test("getNumberOfRows sums across super partitions for a parquet super-partitioned column", () => {
  const acc = accessorOver(
    {
      topSuper: {
        type: RT_PARQUET_SUPER_PARTITIONED,
        data: { superPartitionKeyLength: 1, partitionKeyLength: 1 },
        fields: { '["g1"]': "innerP", '["g2"]': "innerQ" },
      },
      innerP: {
        type: RT_PARQUET_PARTITIONED,
        data: { partitionKeyLength: 1 },
        fields: { '["s1"]': "chunkA" },
      },
      innerQ: {
        type: RT_PARQUET_PARTITIONED,
        data: { partitionKeyLength: 1 },
        fields: { '["s1"]': "chunkB", '["s2"]': "chunkC" },
      },
      chunkA: { type: "PColumnData/ParquetChunk", data: chunkMeta(10) },
      chunkB: { type: "PColumnData/ParquetChunk", data: chunkMeta(20) },
      chunkC: { type: "PColumnData/ParquetChunk", data: chunkMeta(30) },
    },
    "topSuper",
  );

  expect(getNumberOfRows(acc)).toBe(60);
});

test("getNumberOfRows returns undefined when any parquet chunk lacks stats.numberOfRows", () => {
  const acc = accessorOver(
    {
      top: {
        type: RT_PARQUET_PARTITIONED,
        data: { partitionKeyLength: 1 },
        fields: { '["s1"]': "chunkA", '["s2"]': "chunkB" },
      },
      chunkA: { type: "PColumnData/ParquetChunk", data: chunkMeta(100) },
      // stats omitted entirely (it is Partial on the chunk metadata).
      chunkB: { type: "PColumnData/ParquetChunk", data: { dataDigest: "no-stats" } },
    },
    "top",
  );

  expect(getNumberOfRows(acc)).toBeUndefined();
});

test("getNumberOfRows returns undefined while a parquet column is still computing", () => {
  const acc = accessorOver(
    {
      top: {
        type: RT_PARQUET_PARTITIONED,
        data: { partitionKeyLength: 1 },
        fields: { '["s1"]': "chunkA" },
        ready: false,
      },
      chunkA: { type: "PColumnData/ParquetChunk", data: chunkMeta(100) },
    },
    "top",
  );

  expect(getNumberOfRows(acc)).toBeUndefined();
});

test("getNumberOfRows returns undefined for JsonPartitioned (counts live in opaque blobs)", () => {
  const acc = accessorOver(
    {
      top: {
        type: RT_JSON_PARTITIONED,
        data: { partitionKeyLength: 1 },
        fields: { '["s1"]': "blobA", '["s2"]': "blobB" },
      },
      blobA: { type: "Blob", data: {} },
      blobB: { type: "Blob", data: {} },
    },
    "top",
  );

  expect(getNumberOfRows(acc)).toBeUndefined();
});

test("getNumberOfRows counts entries of an inline Json DataInfo", () => {
  const json: DataInfo<TreeNodeAccessor> = {
    type: "Json",
    keyLength: 1,
    data: { '["a"]': 1, '["b"]': 2, '["c"]': 3 },
  };

  expect(getNumberOfRows(json)).toBe(3);
});

test("getNumberOfRows counts inline explicit values", () => {
  const values: PColumnValues = [
    { key: ["a"], val: 1 },
    { key: ["b"], val: 2 },
  ];

  expect(getNumberOfRows(values)).toBe(2);
});

test("getNumberOfRows returns undefined for undefined data", () => {
  expect(getNumberOfRows(undefined)).toBeUndefined();
});
