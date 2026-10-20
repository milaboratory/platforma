import { describe, expect, test } from "vitest";
import { canonicalizeJson } from "../../../json";
import { createGlobalPObjectId } from "../../../pool";
import { relocateBlockIds } from "../../../template/template_relocate";
import {
  columnValueLabel,
  createColumnValueId,
  createColumnValueIds,
  isColumnValueId,
  isColumnValueKey,
  parseColumnValueId,
  type ColumnValueId,
} from "./column_value";
import { createColumnDiscoveredId } from "./discovered_column";
import { createColumnFilteredId } from "./filtered_column";
import { isColumnUniversalId, remapColumnIdBlockIds, type ColumnUniversalId } from "./ids";

const leafId = (blockId: string, name: string) =>
  createGlobalPObjectId(blockId, name) as ColumnUniversalId;

const valueId = (blockId: string, value: string | number) =>
  createColumnValueId({ column: leafId(blockId, "metadata.condition"), value });

const to = (from: string, into: string) => new Map([[from, into]]);

describe("createColumnValueId / parseColumnValueId", () => {
  test("parsing returns the column and the value the id was made of", () => {
    const column = leafId("samples", "metadata.condition");

    expect(parseColumnValueId(createColumnValueId({ column, value: "treated" }))).toEqual({
      __isColumnValue: true,
      column,
      value: "treated",
    });
  });

  test("a number stays a number, distinct from its string form", () => {
    expect(parseColumnValueId(valueId("samples", 2)).value).toBe(2);
    expect(valueId("samples", 2)).not.toBe(valueId("samples", "2"));
  });

  test("the same value of the same column is the same string", () => {
    expect(valueId("samples", "treated")).toBe(valueId("samples", "treated"));
  });

  test("the id is canonical JSON", () => {
    const id = valueId("samples", "treated");

    expect(id).toBe(canonicalizeJson(JSON.parse(id)));
  });

  test("a value that is not a string or a finite number is refused", () => {
    const column = leafId("samples", "metadata.condition");

    for (const value of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createColumnValueId({ column, value })).toThrow();
    }
  });

  test("a column that is not a column id is refused", () => {
    expect(() =>
      createColumnValueId({ column: "condition" as ColumnUniversalId, value: "treated" }),
    ).toThrow();
  });

  test("many values of one column become ids in the order given", () => {
    const column = leafId("samples", "metadata.condition");

    expect(createColumnValueIds({ column, values: ["treated", 2, "control"] })).toEqual([
      createColumnValueId({ column, value: "treated" }),
      createColumnValueId({ column, value: 2 }),
      createColumnValueId({ column, value: "control" }),
    ]);
    expect(createColumnValueIds({ column, values: [] })).toEqual([]);
  });

  test("many values are refused as a whole when one of them is not a usable value", () => {
    const column = leafId("samples", "metadata.condition");

    expect(() => createColumnValueIds({ column, values: ["treated", Number.NaN] })).toThrow();
  });

  test("parsing a column id as a value id throws", () => {
    expect(() =>
      parseColumnValueId(leafId("samples", "metadata.condition") as ColumnValueId),
    ).toThrow();
  });
});

describe("columnValueLabel", () => {
  test("names a column value id by the value it picks", () => {
    expect(columnValueLabel(valueId("samples", "treated"))).toBe("treated");
    expect(columnValueLabel(valueId("samples", 10))).toBe("10");
  });

  test("returns any other string as is", () => {
    expect(columnValueLabel("treated")).toBe("treated");
  });
});

describe("guards", () => {
  test("a value id is not a column id", () => {
    expect(isColumnUniversalId(valueId("samples", "treated"))).toBe(false);
  });

  test("a column id is not a value id", () => {
    expect(isColumnValueId(leafId("samples", "metadata.condition"))).toBe(false);
  });

  test("the key and the id forms are both recognized", () => {
    const id = valueId("samples", "treated");

    expect(isColumnValueId(id)).toBe(true);
    expect(isColumnValueKey(JSON.parse(id))).toBe(true);
  });

  test("an object with the marker but no usable column is not a key", () => {
    expect(isColumnValueKey({ __isColumnValue: true, column: "x", value: "treated" })).toBe(false);
    expect(
      isColumnValueKey({
        __isColumnValue: true,
        column: leafId("samples", "metadata.condition"),
        value: { nested: true },
      }),
    ).toBe(false);
  });
});

describe("relocating a value id", () => {
  test("the block id inside a value id held as a value is repointed", () => {
    expect(relocateBlockIds({ target: valueId("old", "treated") }, to("old", "new"))).toEqual({
      target: valueId("new", "treated"),
    });
  });

  test("the block id inside a value id held as a map key is repointed", () => {
    const params = { ranks: { [valueId("old", "treated")]: 1, [valueId("old", "control")]: 2 } };

    expect(relocateBlockIds(params, to("old", "new"))).toEqual({
      ranks: { [valueId("new", "treated")]: 1, [valueId("new", "control")]: 2 },
    });
  });

  test("a value id under an extra stringify pass comes back wrapped as it was found", () => {
    const params = { blob: JSON.stringify(valueId("old", "treated")) };

    expect(relocateBlockIds(params, to("old", "new"))).toEqual({
      blob: JSON.stringify(valueId("new", "treated")),
    });
  });

  test("the column inside a value id is rebuilt canonical at every level", () => {
    const column = (block: string) =>
      createColumnFilteredId({
        source: createColumnDiscoveredId({ column: leafId(block, "metadata.condition") }),
        axisFilters: [[0, "IGH"]],
      });
    const id = (block: string) => createColumnValueId({ column: column(block), value: "treated" });

    const moved = relocateBlockIds({ target: id("old") }, to("old", "new"));

    expect(moved).toEqual({ target: id("new") });
  });

  test("an object shaped like a value key is plain data: only its nested column id moves", () => {
    const key = (block: string) => ({
      __isColumnValue: true,
      column: leafId(block, "metadata.condition"),
      value: "treated",
      extra: block,
    });

    expect(relocateBlockIds({ target: key("old") }, to("old", "new"))).toEqual({
      target: { ...key("new"), extra: "old" },
    });
  });

  test("a value id with nothing to repoint is the very same string", () => {
    const id = valueId("samples", "treated");

    expect(remapColumnIdBlockIds(id, (blockId) => blockId)).toBe(id);
    expect(remapColumnIdBlockIds(id, (blockId) => (blockId === "other" ? "x" : blockId))).toBe(id);
  });

  test("the value is cell data and is never repointed, even when it equals a block id", () => {
    expect(relocateBlockIds({ target: valueId("old", "old") }, to("old", "new"))).toEqual({
      target: valueId("new", "old"),
    });
  });
});
