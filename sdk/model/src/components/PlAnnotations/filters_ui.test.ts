// @DEPRECATED - use sdk/model/src/filters + sdk/model/src/annotations
import { describe, expect, it, test } from "vitest";
import type {
  AnnotationFilter,
  AnnotationScript,
  IsNA,
  NotFilter,
  NumericalComparisonFilter,
  PatternFilter,
  ValueRank,
} from "./filter";
import { compileAnnotationScript, compileFilter, type FilterUi } from "./filters_ui";

describe("compileAnnotationScript", () => {
  test("should compile an empty annotation script", () => {
    const script = compileAnnotationScript({
      title: "My Annotation",
      mode: "byClonotype",
      steps: [],
    });
    expect(script).toEqual({ title: "My Annotation", mode: "byClonotype", steps: [] });
  });

  test("should compile an annotation script with steps", () => {
    // Helper type for testing, refine if needed
    type AnnotationStepUi = {
      label: string;
      filter: Extract<FilterUi, { type: "and" | "or" }>;
    };
    const uiScript: { title: string; mode: "byClonotype"; steps: AnnotationStepUi[] } = {
      title: "My Annotation",
      mode: "byClonotype",
      steps: [
        {
          label: "Step 1",
          filter: {
            type: "and",
            filters: [
              { type: "isNA", column: "colA" },
              {
                type: "patternEquals",
                column: "colB",
                value: "abc",
              },
            ],
          },
        },
      ],
    };
    const expectedScript: AnnotationScript = {
      title: "My Annotation",
      mode: "byClonotype",
      steps: [
        {
          label: "Step 1",
          filter: {
            type: "and",
            filters: [
              { type: "isNA", column: "colA" },
              {
                type: "pattern",
                column: "colB",
                predicate: { type: "equals", value: "abc" },
              },
            ],
          },
        },
      ],
    };
    const script = compileAnnotationScript(uiScript);
    expect(script).toEqual(expectedScript);
  });
});

describe("compileFilter", () => {
  it('should compile "or" filter', () => {
    const uiFilter: FilterUi = {
      type: "or",
      filters: [{ type: "isNA", column: "colA" }],
    };
    const expectedFilter: AnnotationFilter = {
      type: "or",
      filters: [{ type: "isNA", column: "colA" }],
    };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "and" filter', () => {
    const uiFilter: FilterUi = {
      type: "and",
      filters: [{ type: "isNA", column: "colA" }],
    };
    const expectedFilter: AnnotationFilter = {
      type: "and",
      filters: [{ type: "isNA", column: "colA" }],
    };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile nested "and"/"or" filters', () => {
    const uiFilter: FilterUi = {
      type: "and",
      filters: [
        { type: "isNA", column: "colA" },
        {
          type: "or",
          filters: [
            {
              type: "patternEquals",
              column: "colB",
              value: "test",
            },
          ],
        },
      ],
    };
    const expectedFilter: AnnotationFilter = {
      type: "and",
      filters: [
        { type: "isNA", column: "colA" },
        {
          type: "or",
          filters: [
            {
              type: "pattern",
              column: "colB",
              predicate: { type: "equals", value: "test" },
            },
          ],
        },
      ],
    };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "not" filter', () => {
    const uiFilter: FilterUi = {
      type: "not",
      filter: { type: "isNA", column: "colA" },
    };
    const expectedFilter: AnnotationFilter = {
      type: "not",
      filter: { type: "isNA", column: "colA" },
    };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "isNA" filter', () => {
    const uiFilter: FilterUi = { type: "isNA", column: "colA" };
    const expectedFilter: AnnotationFilter = {
      type: "isNA",
      column: "colA",
    };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "isNotNA" filter', () => {
    const uiFilter: FilterUi = {
      type: "isNotNA",
      column: "colA",
    };
    const expectedIsNA: IsNA = { type: "isNA", column: "colA" };
    const expectedFilter: NotFilter = { type: "not", filter: expectedIsNA };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "patternEquals" filter', () => {
    const uiFilter: FilterUi = {
      type: "patternEquals",
      column: "colB",
      value: "abc",
    };
    const expectedFilter: AnnotationFilter = {
      type: "pattern",
      column: "colB",
      predicate: { type: "equals", value: "abc" },
    };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "patternNotEquals" filter', () => {
    const uiFilter: FilterUi = {
      type: "patternNotEquals",
      column: "colB",
      value: "abc",
    };
    const expectedPatternFilter: PatternFilter = {
      type: "pattern",
      column: "colB",
      predicate: { type: "equals", value: "abc" },
    };
    const expectedFilter: NotFilter = { type: "not", filter: expectedPatternFilter };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "patternContainSubsequence" filter', () => {
    const uiFilter: FilterUi = {
      type: "patternContainSubsequence",
      column: "colC",
      value: "sub",
    };
    const expectedFilter: AnnotationFilter = {
      type: "pattern",
      column: "colC",
      predicate: { type: "containSubsequence", value: "sub" },
    };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "patternNotContainSubsequence" filter', () => {
    const uiFilter: FilterUi = {
      type: "patternNotContainSubsequence",
      column: "colC",
      value: "sub",
    };
    const expectedPatternFilter: PatternFilter = {
      type: "pattern",
      column: "colC",
      predicate: { type: "containSubsequence", value: "sub" },
    };
    const expectedFilter: NotFilter = { type: "not", filter: expectedPatternFilter };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "topN" filter (Top 5)', () => {
    const uiFilter: FilterUi = {
      type: "topN",
      column: "colNum",
      n: 5,
    };
    const expectedRank: ValueRank = {
      transformer: "rank",
      column: "colNum",
      descending: true,
    };
    const expectedFilter: NumericalComparisonFilter = {
      type: "numericalComparison",
      lhs: expectedRank,
      rhs: 5,
      allowEqual: true,
    };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "topN" filter (Bottom 3)', () => {
    const uiFilter: FilterUi = {
      type: "bottomN",
      column: "colNum",
      n: 3,
    };
    const expectedRank: ValueRank = {
      transformer: "rank",
      column: "colNum",
    };
    const expectedFilter: NumericalComparisonFilter = {
      type: "numericalComparison",
      lhs: expectedRank,
      rhs: 3,
      allowEqual: true,
    };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "lessThan" filter', () => {
    const uiFilter: FilterUi = {
      type: "lessThan",
      column: "colNum",
      x: 10,
    };
    const expectedFilter: AnnotationFilter = {
      type: "numericalComparison",
      lhs: "colNum",
      rhs: 10,
    };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "greaterThan" filter', () => {
    const uiFilter: FilterUi = {
      type: "greaterThan",
      column: "colNum",
      x: 5,
    };
    const expectedFilter: AnnotationFilter = {
      type: "numericalComparison",
      rhs: "colNum",
      lhs: 5,
    };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "lessThanOrEqual" filter', () => {
    const uiFilter: FilterUi = {
      type: "lessThanOrEqual",
      column: "colNum",
      x: 20,
    };
    const expectedFilter: AnnotationFilter = {
      type: "numericalComparison",
      lhs: "colNum",
      rhs: 20,
      allowEqual: true,
    };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "greaterThanOrEqual" filter', () => {
    const uiFilter: FilterUi = {
      type: "greaterThanOrEqual",
      column: "colNum",
      x: 0,
    };
    const expectedFilter: AnnotationFilter = {
      type: "numericalComparison",
      rhs: "colNum",
      lhs: 0,
      allowEqual: true,
    };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "lessThanColumn" filter', () => {
    const uiFilter: FilterUi = {
      type: "lessThanColumn",
      column: "colNum1",
      rhs: "colNum2",
      minDiff: 5,
    };
    const expectedFilter: AnnotationFilter = {
      type: "numericalComparison",
      lhs: "colNum1",
      rhs: "colNum2",
      minDiff: 5,
      allowEqual: undefined,
    };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });

  it('should compile "lessThanColumnOrEqual" filter', () => {
    const uiFilter: FilterUi = {
      type: "lessThanColumnOrEqual",
      column: "colNum1",
      rhs: "colNum2",
      minDiff: 6,
    };
    const expectedFilter: AnnotationFilter = {
      type: "numericalComparison",
      lhs: "colNum1",
      rhs: "colNum2",
      minDiff: 6,
      allowEqual: true,
    };
    expect(compileFilter(uiFilter)).toEqual(expectedFilter);
  });
});

// Helper type for testing, refine if needed
// type AnnotationStepUi = {
//   label: string;
//   filter: Extract<FilterUi, { type: 'and' | 'or' }>;
// };
