import {
  Annotation,
  collectColumnReferences,
  createColumnFilteredId,
  createColumnValueId,
  createGlobalPObjectId,
  createLocalPObjectId,
  createPlRef,
  type ColumnValue,
  type PColumnSpec,
  type UpstreamBlockCtx,
} from "@milaboratories/pl-model-common";
import { describe, expect, test, vi } from "vitest";
import {
  checkExport,
  chooseArgs,
  collectOutgoingReferences,
  dependencyStatus,
  dependentStatus,
  isProducerFinal,
  missingValues,
  readBlockLabels,
  readExportValues,
  type ExportCheck,
  type ExportLookup,
  type ExportValues,
  type JsonDataNode,
} from "./status";

const condition = createGlobalPObjectId("samples", "metadata.condition");

describe("chooseArgs", () => {
  const nothing = () => undefined;

  test("current args win and the last run's are not read", () => {
    const lastRun = vi.fn(() => ({ old: true }));

    expect(chooseArgs({ current: () => ({ now: true }), lastRun })).toEqual({
      source: "current",
      args: { now: true },
    });
    expect(lastRun).not.toHaveBeenCalled();
  });

  test("without current args the last run's are read", () => {
    expect(chooseArgs({ current: nothing, lastRun: () => ({ old: true }) })).toEqual({
      source: "lastRun",
      args: { old: true },
    });
  });

  test("with neither there are no args", () => {
    expect(chooseArgs({ current: nothing, lastRun: nothing })).toEqual({ source: "none" });
  });
});

describe("collectOutgoingReferences", () => {
  test("names the producer and output of each referenced column, with the picked values", () => {
    const args = {
      condition: createPlRef("samples", "metadata.condition", true),
      levels: [
        createColumnValueId({ column: condition, value: "treated" }),
        createColumnValueId({ column: condition, value: 1 }),
      ],
      dataset: createPlRef("mixcr", "clones"),
    };

    expect(collectOutgoingReferences(collectColumnReferences(args))).toEqual([
      {
        producerBlockId: "samples",
        output: "metadata.condition",
        ref: condition,
        values: ["treated", 1],
      },
      {
        producerBlockId: "mixcr",
        output: "clones",
        ref: createGlobalPObjectId("mixcr", "clones"),
        values: null,
      },
    ]);
  });

  test("a filtered column is produced by the block exporting its leaf", () => {
    const filtered = createColumnFilteredId({ source: condition, axisFilters: [[0, "s1"]] });

    expect(collectOutgoingReferences(collectColumnReferences({ filtered }))).toEqual([
      { producerBlockId: "samples", output: "metadata.condition", ref: filtered, values: null },
    ]);
  });

  test("a column local to the block is not a reference to another block", () => {
    const local = createLocalPObjectId(["main", "outputs"], "table");

    expect(collectOutgoingReferences(collectColumnReferences({ local }))).toEqual([]);
  });
});

describe("isProducerFinal", () => {
  const locked = (ctx: string) => ctx === "locked";

  test("a block that never ran has nothing more to export", () => {
    expect(isProducerFinal(producer({}), locked)).toBe(true);
  });

  test("a run whose results are still rendering may export more", () => {
    expect(isProducerFinal(producer({ prodIncomplete: true }), locked)).toBe(false);
  });

  test("a run whose result list is open may export more", () => {
    expect(isProducerFinal(producer({ prodCtx: "open" }), locked)).toBe(false);
  });

  test("a run whose result list is locked is settled", () => {
    expect(isProducerFinal(producer({ prodCtx: "locked" }), locked)).toBe(true);
  });
});

describe("checkExport", () => {
  test("a missing export is unavailable", () => {
    expect(checkExport(() => ({ type: "unavailable" }), ["a"])).toEqual({
      check: { type: "unavailable" },
      columnLabel: null,
    });
  });

  test("an export still computing is pending", () => {
    expect(checkExport(() => ({ type: "pending" }), null)).toEqual({
      check: { type: "pending" },
      columnLabel: null,
    });
  });

  test("a column used as a whole is ok without reading its values", () => {
    const readValues = vi.fn((): ExportValues => ({ type: "unreadable" }));

    expect(checkExport(() => present({ readValues, columnLabel: "Condition" }), null)).toEqual({
      check: { type: "ok" },
      columnLabel: "Condition",
    });
    expect(readValues).not.toHaveBeenCalled();
  });

  test("picked values all present are ok", () => {
    expect(checkExport(() => present({ cells: ["a", "b"] }), ["b", "a"]).check).toEqual({
      type: "ok",
    });
  });

  test("a number picked as a string matches a number cell, and the other way round", () => {
    expect(checkExport(() => present({ cells: [1, "2"] }), ["1", 2]).check).toEqual({
      type: "ok",
    });
  });

  test("a string spelling a number differently is a different value", () => {
    expect(checkExport(() => present({ cells: [1] }), ["1.0"]).check).toEqual({
      type: "missingValues",
      values: ["1.0"],
    });
  });

  test("null cells hold no value, not even the string null", () => {
    expect(checkExport(() => present({ cells: [null, "a"] }), ["null", "a"]).check).toEqual({
      type: "missingValues",
      values: ["null"],
    });
  });

  test("missing values come in picked order", () => {
    expect(checkExport(() => present({ cells: ["b"] }), ["c", "b", "a"]).check).toEqual({
      type: "missingValues",
      values: ["c", "a"],
    });
  });

  test("values still loading are pending", () => {
    expect(
      checkExport(() => present({ readValues: () => ({ type: "pending" }) }), ["a"]).check,
    ).toEqual({ type: "pending" });
  });

  test("values that cannot be read are unchecked as unreadable", () => {
    expect(
      checkExport(() => present({ readValues: () => ({ type: "unreadable" }) }), ["a"]).check,
    ).toEqual({ type: "unchecked", reason: "unreadable" });
  });

  test("a failing lookup is unchecked as unreadable", () => {
    const lookup = (): ExportLookup => {
      throw new Error("boom");
    };

    expect(checkExport(lookup, ["a"])).toEqual({
      check: { type: "unchecked", reason: "unreadable" },
      columnLabel: null,
    });
  });

  test("failing to read values is unchecked as unreadable and keeps the column label", () => {
    const readValues = (): ExportValues => {
      throw new Error("out of memory");
    };

    expect(checkExport(() => present({ readValues, columnLabel: "Condition" }), ["a"])).toEqual({
      check: { type: "unchecked", reason: "unreadable" },
      columnLabel: "Condition",
    });
  });
});

describe("dependencyStatus", () => {
  test("an unavailable export breaks the reference", () => {
    expect(dependencyStatus({ type: "unavailable" })).toEqual({
      type: "broken",
      reason: "unavailable",
    });
  });

  test("missing values break the reference", () => {
    expect(dependencyStatus({ type: "missingValues", values: ["a"] })).toEqual({
      type: "broken",
      reason: "missingValues",
      values: ["a"],
    });
  });

  test.each(NEUTRAL_CHECKS)("%j stays as it is", (check) => {
    expect(dependencyStatus(check)).toEqual(check);
  });
});

describe("dependentStatus", () => {
  test("an output this block does not export breaks the reference as notExported", () => {
    expect(dependentStatus({ type: "unavailable" })).toEqual({
      type: "broken",
      reason: "notExported",
    });
  });

  test("missing values are reported as they are", () => {
    expect(dependentStatus({ type: "missingValues", values: [1] })).toEqual({
      type: "missingValues",
      values: [1],
    });
  });

  test.each(NEUTRAL_CHECKS)("%j stays as it is", (check) => {
    expect(dependentStatus(check)).toEqual(check);
  });
});

describe("missingValues", () => {
  test("cells of other types hold no pickable value", () => {
    expect(missingValues(["true", "1"], [true, { v: 1 }, Number.NaN])).toEqual(["true", "1"]);
  });
});

describe("readExportValues", () => {
  test("discrete values in the spec are used without touching the data", () => {
    const data = jsonNode({ resourceType: "PColumnData/Json", content: { data: {} } });
    const read = vi.spyOn(data, "getDataAsJsonOrUndefined");

    expect(readExportValues(specWith({ discreteValues: ["a", "b"] }), data)).toEqual({
      type: "known",
      cells: ["a", "b"],
    });
    expect(read).not.toHaveBeenCalled();
  });

  test("JSON data yields its cells", () => {
    const data = jsonNode({
      resourceType: "PColumnData/Json",
      content: { keyLength: 1, data: { '["s1"]': "a", '["s2"]': 2, '["s3"]': null } },
    });

    expect(readExportValues(specWith({}), data)).toEqual({ type: "known", cells: ["a", 2, null] });
  });

  test("JSON data not yet computed is pending", () => {
    const data = jsonNode({ resourceType: "PColumnData/Json", content: undefined });

    expect(readExportValues(specWith({}), data)).toEqual({ type: "pending" });
  });

  test("JSON data of an unexpected shape is unreadable", () => {
    const data = jsonNode({ resourceType: "PColumnData/Json", content: [1, 2] });

    expect(readExportValues(specWith({}), data)).toEqual({ type: "unreadable" });
  });

  test("partitioned JSON data yields the cells of every part", () => {
    const data = jsonNode({
      resourceType: "PColumnData/JsonPartitioned",
      parts: {
        '["p1"]': jsonNode({ resourceType: "PColumnData/Json", content: { data: { k: "a" } } }),
        '["p2"]': jsonNode({ resourceType: "PColumnData/Json", content: { data: { k: "b" } } }),
      },
    });

    expect(readExportValues(specWith({}), data)).toEqual({ type: "known", cells: ["a", "b"] });
  });

  test("partitioned JSON data with parts still arriving is pending", () => {
    const data = jsonNode({
      resourceType: "PColumnData/JsonPartitioned",
      parts: {},
      locked: false,
    });

    expect(readExportValues(specWith({}), data)).toEqual({ type: "pending" });
  });

  test("partitioned JSON data with a part not yet computed is pending", () => {
    const data = jsonNode({
      resourceType: "PColumnData/JsonPartitioned",
      parts: { '["p1"]': jsonNode({ resourceType: "PColumnData/Json", content: undefined }) },
    });

    expect(readExportValues(specWith({}), data)).toEqual({ type: "pending" });
  });

  test("binary data is unreadable", () => {
    const data = jsonNode({ resourceType: "PColumnData/BinaryPartitioned", parts: {} });

    expect(readExportValues(specWith({}), data)).toEqual({ type: "unreadable" });
  });

  test("data not yet attached is pending", () => {
    expect(readExportValues(specWith({}), undefined)).toEqual({ type: "pending" });
  });
});

describe("readBlockLabels", () => {
  test("labels each block once and leaves out the ones that cannot be labelled", () => {
    const labelOf = vi.fn((blockId: string) => {
      if (blockId === "gone") throw new Error(`Block ${blockId} not found.`);
      return `Label of ${blockId}`;
    });

    expect(readBlockLabels(["a", "gone", "a", "b"], labelOf)).toEqual({
      a: "Label of a",
      b: "Label of b",
    });
    expect(labelOf).toHaveBeenCalledTimes(3);
  });
});

// Internals

function producer(props: { prodCtx?: string; prodIncomplete?: boolean }): UpstreamBlockCtx<string> {
  return { blockId: "producer", ...props };
}

function present(
  props:
    | { cells: readonly unknown[]; columnLabel?: string }
    | { readValues: () => ExportValues; columnLabel?: string },
): ExportLookup {
  const readValues =
    "readValues" in props
      ? props.readValues
      : (): ExportValues => ({ type: "known", cells: props.cells });
  return { type: "present", columnLabel: props.columnLabel ?? null, readValues };
}

/** Checks that read the same for the block holding the reference and the block exporting it. */
const NEUTRAL_CHECKS: ExportCheck[] = [
  { type: "ok" },
  { type: "pending" },
  { type: "unchecked", reason: "unreadable" },
  { type: "unchecked", reason: "unsupported" },
];

function specWith(props: { discreteValues?: ColumnValue[] }): Pick<PColumnSpec, "annotations"> {
  const annotations: Record<string, string> = {};
  if (props.discreteValues !== undefined) {
    annotations[Annotation.DiscreteValues] = JSON.stringify(props.discreteValues);
  }
  return { annotations };
}

function jsonNode(props: {
  resourceType: string;
  content?: unknown;
  parts?: Record<string, JsonDataNode>;
  locked?: boolean;
}): JsonDataNode {
  const parts = props.parts ?? {};
  return {
    resourceType: { name: props.resourceType },
    getDataAsJsonOrUndefined: () => props.content,
    getInputsLocked: () => props.locked ?? true,
    listInputFields: () => Object.keys(parts),
    resolve: (field) => parts[field],
  };
}
