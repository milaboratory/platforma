import { describe, expect, test } from "vitest";
import { canonicalizeJson } from "../../../json";
import { createGlobalPObjectId, createLocalPObjectId } from "../../../pool";
import { createPlRef } from "../../../ref";
import { collectColumnReferences, columnProducer } from "./column_references";
import { createColumnValueId, parseColumnValueId } from "./column_value";
import { createColumnDiscoveredId } from "./discovered_column";
import { createColumnFilteredId } from "./filtered_column";
import { parseColumnId, type ColumnUniversalId } from "./ids";
import { createColumnOverriddenId } from "./overridden";

const leafId = (blockId: string, name: string): ColumnUniversalId =>
  createGlobalPObjectId(blockId, name);

const condition = leafId("samples", "metadata.condition");
const donor = leafId("samples", "metadata.donor");

const conditionValue = (value: string | number) =>
  createColumnValueId({ column: condition, value });

describe("collectColumnReferences", () => {
  test("a ref object is its output's plain id, with or without enrichments", () => {
    const args = {
      a: createPlRef("samples", "metadata.condition"),
      b: createPlRef("samples", "metadata.donor", true),
    };

    expect(collectColumnReferences(args)).toEqual([
      { ref: condition, values: null },
      { ref: donor, values: null },
    ]);
  });

  test("a column id string is referenced, and the same column held as a ref is the same entry", () => {
    const args = { id: condition, ref: createPlRef("samples", "metadata.condition", true) };

    expect(collectColumnReferences(args)).toEqual([{ ref: condition, values: null }]);
  });

  test("a leaf id string holding requireEnrichments is the plain id", () => {
    const withEnrichments = canonicalizeJson(createPlRef("samples", "metadata.condition", true));

    expect(collectColumnReferences({ id: withEnrichments })).toEqual([
      { ref: condition, values: null },
    ]);
  });

  test("a filtered id counts once, as itself and not as its leaf", () => {
    const filtered = createColumnFilteredId({ source: condition, axisFilters: [[0, "s1"]] });

    expect(collectColumnReferences({ filtered })).toEqual([{ ref: filtered, values: null }]);
  });

  test("discovered and overridden ids count as themselves, not as the ids inside them", () => {
    const discovered = createColumnDiscoveredId({
      column: condition,
      path: [{ type: "linker", column: leafId("linker", "cell-to-sample") }],
    });
    const overridden = createColumnOverriddenId({
      source: donor,
      specOverrides: { annotations: { "pl7.app/label": "Donor" } },
    });

    expect(collectColumnReferences({ discovered, overridden })).toEqual([
      { ref: discovered, values: null },
      { ref: overridden, values: null },
    ]);
  });

  test("a column key object counts as its canonical id", () => {
    const filtered = createColumnFilteredId({ source: condition, axisFilters: [[0, "s1"]] });

    expect(collectColumnReferences({ key: parseColumnId(filtered) })).toEqual([
      { ref: filtered, values: null },
    ]);
  });

  test("value ids merge into the entry of their column", () => {
    const args = {
      column: condition,
      order: [conditionValue("treated"), conditionValue("control")],
    };

    expect(collectColumnReferences(args)).toEqual([
      { ref: condition, values: ["treated", "control"] },
    ]);
  });

  test("a value id whose column is never referenced on its own still makes an entry", () => {
    expect(collectColumnReferences({ target: conditionValue("treated") })).toEqual([
      { ref: condition, values: ["treated"] },
    ]);
  });

  test("a value id of a filtered column belongs to the filtered column, not to its leaf", () => {
    const filtered = createColumnFilteredId({ source: condition, axisFilters: [[0, "s1"]] });
    const args = {
      plain: condition,
      target: createColumnValueId({ column: filtered, value: "treated" }),
    };

    expect(collectColumnReferences(args)).toEqual([
      { ref: condition, values: null },
      { ref: filtered, values: ["treated"] },
    ]);
  });

  test("the same value met twice is listed once, and a number stays apart from its string", () => {
    const id = conditionValue("treated");
    const args = {
      a: id,
      b: [id],
      c: { [id]: true },
      d: conditionValue(2),
      e: conditionValue("2"),
    };

    expect(collectColumnReferences(args)).toEqual([
      { ref: condition, values: ["treated", 2, "2"] },
    ]);
  });

  test("columns come in the order first met, by a value or on their own", () => {
    const args = {
      first: createColumnValueId({ column: donor, value: "d1" }),
      second: condition,
      third: createColumnValueId({ column: donor, value: "d2" }),
    };

    expect(collectColumnReferences(args)).toEqual([
      { ref: donor, values: ["d1", "d2"] },
      { ref: condition, values: null },
    ]);
  });

  test("ids used as map keys are found", () => {
    const args = { ranks: { [conditionValue("treated")]: 1 }, labels: { [donor]: "Donor" } };

    expect(collectColumnReferences(args)).toEqual([
      { ref: condition, values: ["treated"] },
      { ref: donor, values: null },
    ]);
  });

  test("ids under any number of stringify passes are found", () => {
    const args = {
      once: JSON.stringify(conditionValue("a")),
      twice: JSON.stringify(JSON.stringify({ x: [donor] })),
    };

    expect(collectColumnReferences(args)).toEqual([
      { ref: condition, values: ["a"] },
      { ref: donor, values: null },
    ]);
  });

  test("an object shaped like a value key is plain data: its column counts on its own", () => {
    const key = parseColumnValueId(conditionValue("treated"));

    expect(collectColumnReferences({ target: key })).toEqual([{ ref: condition, values: null }]);
  });

  test("a value id string with extra fields contributes its value", () => {
    const key = parseColumnValueId(conditionValue("treated"));

    expect(collectColumnReferences({ target: canonicalizeJson({ ...key, extra: 1 }) })).toEqual([
      { ref: condition, values: ["treated"] },
    ]);
  });

  test("ordinary values reference nothing", () => {
    expect(collectColumnReferences({ values: ["treated", 1, true, null], blob: "{}" })).toEqual([]);
  });
});

describe("columnProducer", () => {
  test("a global leaf is its own producer", () => {
    expect(columnProducer(condition)).toEqual(createPlRef("samples", "metadata.condition"));
  });

  test("a local leaf belongs to the block holding it and has no producer", () => {
    expect(columnProducer(createLocalPObjectId(["pf"], "condition"))).toBeUndefined();
  });

  test("a filtered column's producer is its leaf", () => {
    const column = createColumnFilteredId({ source: condition, axisFilters: [[0, "IGH"]] });

    expect(columnProducer(column)).toEqual(createPlRef("samples", "metadata.condition"));
  });

  test("a discovered column's producer is the column it discovered, not a linker", () => {
    const column = createColumnDiscoveredId({
      column: condition,
      path: [{ type: "linker", column: leafId("linker", "cell-to-sample") }],
    });

    expect(columnProducer(column)).toEqual(createPlRef("samples", "metadata.condition"));
  });

  test("an overridden column's producer is its leaf", () => {
    const column = createColumnOverriddenId({
      source: condition,
      specOverrides: { annotations: { "pl7.app/label": "Condition" } },
    });

    expect(columnProducer(column)).toEqual(createPlRef("samples", "metadata.condition"));
  });

  test("a wrapper with no usable leaf inside has no producer", () => {
    expect(columnProducer('{"__isFiltered":true}' as ColumnUniversalId)).toBeUndefined();
  });
});
