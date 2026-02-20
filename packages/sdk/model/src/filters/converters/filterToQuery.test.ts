import { describe, expect, it } from "vitest";
import type { FilterSpec, FilterSpecLeaf } from "@milaboratories/pl-model-common";
import { filterSpecToSpecQueryExpr } from "./filterToQuery";

type QFilterSpec = FilterSpec<FilterSpecLeaf<string>>;

/** Helper: creates a CanonicalizedJson<PTableColumnId> for a regular column. */
function colRef(id: string): string {
  return JSON.stringify({ type: "column", id });
}

/** Helper: creates a CanonicalizedJson<PTableColumnId> for an axis. */
function axisRef(id: string): string {
  return JSON.stringify({ type: "axis", id });
}

describe("filterSpecToSpecQueryExpr", () => {
  // --- logical combinators ---

  it('should convert "and" filter', () => {
    const filter: QFilterSpec = {
      type: "and",
      filters: [
        { type: "equal", column: colRef("c1"), x: 1 },
        { type: "equal", column: colRef("c2"), x: 2 },
      ],
    };
    const result = filterSpecToSpecQueryExpr(filter);
    expect(result.type).toBe("and");
    if (result.type === "and") {
      expect(result.input).toHaveLength(2);
    }
  });

  it('should convert "or" filter', () => {
    const filter: QFilterSpec = {
      type: "or",
      filters: [
        { type: "equal", column: colRef("c1"), x: 1 },
        { type: "equal", column: colRef("c2"), x: 2 },
      ],
    };
    const result = filterSpecToSpecQueryExpr(filter);
    expect(result.type).toBe("or");
    if (result.type === "or") {
      expect(result.input).toHaveLength(2);
    }
  });

  it('should convert "not" filter', () => {
    const filter: QFilterSpec = {
      type: "not",
      filter: { type: "equal", column: colRef("c1"), x: 5 },
    };
    const result = filterSpecToSpecQueryExpr(filter);
    expect(result.type).toBe("not");
    if (result.type === "not") {
      expect(result.input.type).toBe("numericComparison");
    }
  });

  it("should skip filters with undefined type in and/or", () => {
    const filter: QFilterSpec = {
      type: "and",
      filters: [{ type: undefined }, { type: "equal", column: colRef("c1"), x: 1 }],
    };
    const result = filterSpecToSpecQueryExpr(filter);
    expect(result.type).toBe("and");
    if (result.type === "and") {
      expect(result.input).toHaveLength(1);
      expect(result.input[0].type).toBe("numericComparison");
    }
  });

  it("should throw for empty and filter (after skipping undefined)", () => {
    const filter: QFilterSpec = {
      type: "and",
      filters: [{ type: undefined }],
    };
    expect(() => filterSpecToSpecQueryExpr(filter)).toThrow(
      "AND filter requires at least one operand",
    );
  });

  it("should throw for empty or filter", () => {
    const filter: QFilterSpec = { type: "or", filters: [] };
    expect(() => filterSpecToSpecQueryExpr(filter)).toThrow(
      "OR filter requires at least one operand",
    );
  });

  // --- string filters ---

  it('should convert "patternEquals" filter', () => {
    const filter: QFilterSpec = {
      type: "patternEquals",
      column: colRef("col1"),
      value: "abc",
    };
    expect(filterSpecToSpecQueryExpr(filter)).toEqual({
      type: "stringEquals",
      input: { type: "columnRef", value: "col1" },
      value: "abc",
      caseInsensitive: false,
    });
  });

  it('should convert "patternNotEquals" filter', () => {
    const filter: QFilterSpec = {
      type: "patternNotEquals",
      column: colRef("col1"),
      value: "abc",
    };
    expect(filterSpecToSpecQueryExpr(filter)).toEqual({
      type: "not",
      input: {
        type: "stringEquals",
        input: { type: "columnRef", value: "col1" },
        value: "abc",
        caseInsensitive: false,
      },
    });
  });

  it('should convert "patternContainSubsequence" filter', () => {
    const filter: QFilterSpec = {
      type: "patternContainSubsequence",
      column: colRef("col1"),
      value: "sub",
    };
    expect(filterSpecToSpecQueryExpr(filter)).toEqual({
      type: "stringContains",
      input: { type: "columnRef", value: "col1" },
      value: "sub",
      caseInsensitive: false,
    });
  });

  it('should convert "patternNotContainSubsequence" filter', () => {
    const filter: QFilterSpec = {
      type: "patternNotContainSubsequence",
      column: colRef("col1"),
      value: "sub",
    };
    expect(filterSpecToSpecQueryExpr(filter)).toEqual({
      type: "not",
      input: {
        type: "stringContains",
        input: { type: "columnRef", value: "col1" },
        value: "sub",
        caseInsensitive: false,
      },
    });
  });

  it('should convert "patternMatchesRegularExpression" filter', () => {
    const filter: QFilterSpec = {
      type: "patternMatchesRegularExpression",
      column: colRef("col1"),
      value: "^abc.*",
    };
    expect(filterSpecToSpecQueryExpr(filter)).toEqual({
      type: "stringRegex",
      input: { type: "columnRef", value: "col1" },
      value: "^abc.*",
    });
  });

  it('should convert "patternFuzzyContainSubsequence" filter with defaults', () => {
    const filter: QFilterSpec = {
      type: "patternFuzzyContainSubsequence",
      column: colRef("col1"),
      value: "fuz",
    };
    expect(filterSpecToSpecQueryExpr(filter)).toEqual({
      type: "stringContainsFuzzy",
      input: { type: "columnRef", value: "col1" },
      value: "fuz",
      maxEdits: 1,
      caseInsensitive: false,
      substitutionsOnly: false,
      wildcard: null,
    });
  });

  it('should convert "patternFuzzyContainSubsequence" filter with custom options', () => {
    const filter: QFilterSpec = {
      type: "patternFuzzyContainSubsequence",
      column: colRef("col1"),
      value: "fuz",
      maxEdits: 3,
      substitutionsOnly: true,
      wildcard: "?",
    };
    expect(filterSpecToSpecQueryExpr(filter)).toEqual({
      type: "stringContainsFuzzy",
      input: { type: "columnRef", value: "col1" },
      value: "fuz",
      maxEdits: 3,
      caseInsensitive: false,
      substitutionsOnly: true,
      wildcard: "?",
    });
  });

  // --- numeric comparison filters ---

  it("should convert numeric comparison filters", () => {
    const testCases = [
      { type: "equal" as const, operand: "eq" },
      { type: "notEqual" as const, operand: "ne" },
      { type: "lessThan" as const, operand: "lt" },
      { type: "greaterThan" as const, operand: "gt" },
      { type: "lessThanOrEqual" as const, operand: "le" },
      { type: "greaterThanOrEqual" as const, operand: "ge" },
    ];

    testCases.forEach(({ type, operand }) => {
      const filter: QFilterSpec = { type, column: colRef("num"), x: 42 };
      expect(filterSpecToSpecQueryExpr(filter)).toEqual({
        type: "numericComparison",
        operand,
        left: { type: "columnRef", value: "num" },
        right: { type: "constant", value: 42 },
      });
    });
  });

  // --- column-to-column comparisons ---

  it('should convert "equalToColumn" filter', () => {
    const filter: QFilterSpec = {
      type: "equalToColumn",
      column: colRef("c1"),
      rhs: colRef("c2"),
    };
    expect(filterSpecToSpecQueryExpr(filter)).toEqual({
      type: "numericComparison",
      operand: "eq",
      left: { type: "columnRef", value: "c1" },
      right: { type: "columnRef", value: "c2" },
    });
  });

  it("should convert column comparison filters without minDiff", () => {
    const cases = [
      { type: "lessThanColumn" as const, operand: "lt" },
      { type: "greaterThanColumn" as const, operand: "gt" },
      { type: "lessThanColumnOrEqual" as const, operand: "le" },
      { type: "greaterThanColumnOrEqual" as const, operand: "ge" },
    ];

    cases.forEach(({ type, operand }) => {
      const filter: QFilterSpec = { type, column: colRef("c1"), rhs: colRef("c2") };
      expect(filterSpecToSpecQueryExpr(filter)).toEqual({
        type: "numericComparison",
        operand,
        left: { type: "columnRef", value: "c1" },
        right: { type: "columnRef", value: "c2" },
      });
    });
  });

  it("should convert column comparison filters with minDiff", () => {
    const cases = [
      { type: "lessThanColumn" as const, operand: "lt" },
      { type: "greaterThanColumn" as const, operand: "gt" },
      { type: "lessThanColumnOrEqual" as const, operand: "le" },
      { type: "greaterThanColumnOrEqual" as const, operand: "ge" },
    ];

    cases.forEach(({ type, operand }) => {
      const filter: QFilterSpec = { type, column: colRef("c1"), rhs: colRef("c2"), minDiff: 5 };
      expect(filterSpecToSpecQueryExpr(filter)).toEqual({
        type: "numericComparison",
        operand,
        left: {
          type: "numericBinary",
          operand: "add",
          left: { type: "columnRef", value: "c1" },
          right: { type: "constant", value: 5 },
        },
        right: { type: "columnRef", value: "c2" },
      });
    });
  });

  it("should treat minDiff=0 as no minDiff", () => {
    const filter: QFilterSpec = {
      type: "lessThanColumn",
      column: colRef("c1"),
      rhs: colRef("c2"),
      minDiff: 0,
    };
    expect(filterSpecToSpecQueryExpr(filter)).toEqual({
      type: "numericComparison",
      operand: "lt",
      left: { type: "columnRef", value: "c1" },
      right: { type: "columnRef", value: "c2" },
    });
  });

  // --- set filters ---

  it('should convert "inSet" filter', () => {
    const filter: QFilterSpec = {
      type: "inSet",
      column: colRef("col1"),
      value: ["a", "b", "c"],
    };
    expect(filterSpecToSpecQueryExpr(filter)).toEqual({
      type: "isIn",
      input: { type: "columnRef", value: "col1" },
      set: ["a", "b", "c"],
    });
  });

  it('should convert "notInSet" filter', () => {
    const filter: QFilterSpec = {
      type: "notInSet",
      column: colRef("col1"),
      value: ["x"],
    };
    expect(filterSpecToSpecQueryExpr(filter)).toEqual({
      type: "not",
      input: {
        type: "isIn",
        input: { type: "columnRef", value: "col1" },
        set: ["x"],
      },
    });
  });

  // --- axis references ---

  it("should resolve axis column references", () => {
    const filter: QFilterSpec = {
      type: "equal",
      column: axisRef("pl7.app/sampleId"),
      x: 10,
    };
    expect(filterSpecToSpecQueryExpr(filter)).toEqual({
      type: "numericComparison",
      operand: "eq",
      left: { type: "axisRef", value: "pl7.app/sampleId" },
      right: { type: "constant", value: 10 },
    });
  });

  // --- null check filters ---

  it('should convert "isNA" filter', () => {
    const filter: QFilterSpec = { type: "isNA", column: colRef("c1") };
    expect(filterSpecToSpecQueryExpr(filter)).toEqual({
      type: "isNull",
      input: { type: "columnRef", value: "c1" },
    });
  });

  it('should convert "isNotNA" filter', () => {
    const filter: QFilterSpec = { type: "isNotNA", column: colRef("c1") };
    expect(filterSpecToSpecQueryExpr(filter)).toEqual({
      type: "not",
      input: {
        type: "isNull",
        input: { type: "columnRef", value: "c1" },
      },
    });
  });

  // --- unsupported types ---

  it("should throw for topN filter", () => {
    const filter: QFilterSpec = { type: "topN", column: colRef("c1"), n: 5 };
    expect(() => filterSpecToSpecQueryExpr(filter)).toThrow('Filter type "topN" is not supported');
  });

  it("should throw for bottomN filter", () => {
    const filter: QFilterSpec = { type: "bottomN", column: colRef("c1"), n: 3 };
    expect(() => filterSpecToSpecQueryExpr(filter)).toThrow(
      'Filter type "bottomN" is not supported',
    );
  });

  it("should throw for undefined filter type", () => {
    const filter: QFilterSpec = { type: undefined };
    expect(() => filterSpecToSpecQueryExpr(filter)).toThrow("Filter type is undefined");
  });

  // --- nested ---

  it("should convert nested and/or/not filters", () => {
    const filter: QFilterSpec = {
      type: "and",
      filters: [
        {
          type: "or",
          filters: [
            { type: "patternEquals", column: colRef("col1"), value: "a" },
            { type: "patternEquals", column: colRef("col1"), value: "b" },
          ],
        },
        {
          type: "not",
          filter: { type: "greaterThan", column: colRef("num"), x: 100 },
        },
      ],
    };
    const result = filterSpecToSpecQueryExpr(filter);
    expect(result.type).toBe("and");
    if (result.type === "and") {
      expect(result.input).toHaveLength(2);
      expect(result.input[0].type).toBe("or");
      expect(result.input[1].type).toBe("not");
    }
  });
});
