import { describe, expect, test } from "vitest";
import { convertColumnSelectorToMultiColumnSelector } from "./column_selector";
import type { RegExpString } from "@milaboratories/helpers";

// --- convertColumnSelectorToMultiColumnSelector ---

describe("convertColumnSelectorToMultiColumnSelector", () => {
  test("wraps single selector in array", () => {
    const result = convertColumnSelectorToMultiColumnSelector({ name: "foo" });
    expect(result).toHaveLength(1);
    expect(result[0].name).toEqual([{ type: "regex", value: "foo" }]);
  });

  test("passes through array of selectors", () => {
    const result = convertColumnSelectorToMultiColumnSelector([{ name: "a" }, { name: "b" }]);
    expect(result).toHaveLength(2);
  });

  test("normalizes plain string name to RegexMatcher[]", () => {
    const [sel] = convertColumnSelectorToMultiColumnSelector({ name: "foo" });
    expect(sel.name).toEqual([{ type: "regex", value: "foo" }]);
  });

  test("normalizes array of mixed strings and matchers", () => {
    const [sel] = convertColumnSelectorToMultiColumnSelector({
      name: ["foo", { type: "regex", value: "bar.*" as RegExpString }],
    });
    expect(sel.name).toEqual([
      { type: "regex", value: "foo" },
      { type: "regex", value: "bar.*" },
    ]);
  });

  test("normalizes single StringMatcher object", () => {
    const [sel] = convertColumnSelectorToMultiColumnSelector({
      name: { type: "exact", value: "foo" },
    });
    expect(sel.name).toEqual([{ type: "exact", value: "foo" }]);
  });

  test("normalizes single ValueType to array", () => {
    const [sel] = convertColumnSelectorToMultiColumnSelector({ type: "Int" });
    expect(sel.type).toEqual(["Int"]);
  });

  test("passes through ValueType array", () => {
    const [sel] = convertColumnSelectorToMultiColumnSelector({ type: ["Int", "Long"] });
    expect(sel.type).toEqual(["Int", "Long"]);
  });

  test("normalizes record with plain string values", () => {
    const [sel] = convertColumnSelectorToMultiColumnSelector({
      domain: { "pl7.app/chain": "IGHeavy" },
    });
    expect(sel.domain).toEqual({
      "pl7.app/chain": [{ type: "regex", value: "IGHeavy" }],
    });
  });

  test("normalizes record with mixed array values", () => {
    const [sel] = convertColumnSelectorToMultiColumnSelector({
      annotations: { label: ["a", { type: "regex", value: "b.*" as RegExpString }] },
    });
    expect(sel.annotations).toEqual({
      label: [
        { type: "regex", value: "a" },
        { type: "regex", value: "b.*" },
      ],
    });
  });

  test("normalizes axes", () => {
    const [sel] = convertColumnSelectorToMultiColumnSelector({
      axes: [{ name: "axisName", type: "String" }],
    });
    expect(sel.axes).toEqual([{ name: [{ type: "regex", value: "axisName" }], type: ["String"] }]);
  });

  test("preserves partialAxesMatch", () => {
    const [sel] = convertColumnSelectorToMultiColumnSelector({ partialAxesMatch: false });
    expect(sel.partialAxesMatch).toBe(false);
  });

  test("omits undefined fields", () => {
    const [sel] = convertColumnSelectorToMultiColumnSelector({ name: "foo" });
    expect(sel.type).toBeUndefined();
    expect(sel.domain).toBeUndefined();
    expect(sel.axes).toBeUndefined();
  });
});
