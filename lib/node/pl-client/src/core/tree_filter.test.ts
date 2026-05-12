import { describe, expect, test } from "vitest";
import { treeFilter, FilterOperatorType, FilterProperty } from "./tree_filter";
import type { Filter } from "./tree_filter";

describe("treeFilter builders — wire shape", () => {
  // ── Leaf helpers ───────────────────────────────────────────────────────────

  test("resourceTypeEq produces EQUAL / RESOURCE_TYPE / stringValue", () => {
    const f = treeFilter.resourceTypeEq("Blob");
    expect(f).toEqual<Filter>({
      key: FilterProperty.RESOURCE_TYPE,
      operator: FilterOperatorType.EQUAL,
      value: { oneofKind: "stringValue", stringValue: "Blob" },
    });
  });

  test("resourceTypeMatch produces MATCH / RESOURCE_TYPE / stringValue", () => {
    const f = treeFilter.resourceTypeMatch("^Blob/");
    expect(f).toEqual<Filter>({
      key: FilterProperty.RESOURCE_TYPE,
      operator: FilterOperatorType.MATCH,
      value: { oneofKind: "stringValue", stringValue: "^Blob/" },
    });
  });

  test("fieldNameEq produces EQUAL / FIELD_NAME / stringValue", () => {
    const f = treeFilter.fieldNameEq("output");
    expect(f).toEqual<Filter>({
      key: FilterProperty.FIELD_NAME,
      operator: FilterOperatorType.EQUAL,
      value: { oneofKind: "stringValue", stringValue: "output" },
    });
  });

  test("fieldNameMatch produces MATCH / FIELD_NAME / stringValue", () => {
    const f = treeFilter.fieldNameMatch("^__service");
    expect(f).toEqual<Filter>({
      key: FilterProperty.FIELD_NAME,
      operator: FilterOperatorType.MATCH,
      value: { oneofKind: "stringValue", stringValue: "^__service" },
    });
  });

  test("isFinal(true) produces EQUAL / IS_FINAL / boolValue:true", () => {
    const f = treeFilter.isFinal(true);
    expect(f).toEqual<Filter>({
      key: FilterProperty.IS_FINAL,
      operator: FilterOperatorType.EQUAL,
      value: { oneofKind: "boolValue", boolValue: true },
    });
  });

  test("isFinal(false) produces EQUAL / IS_FINAL / boolValue:false", () => {
    const f = treeFilter.isFinal(false);
    expect(f).toEqual<Filter>({
      key: FilterProperty.IS_FINAL,
      operator: FilterOperatorType.EQUAL,
      value: { oneofKind: "boolValue", boolValue: false },
    });
  });

  test("allOutputsFinal(true) produces EQUAL / ALL_OUTPUTS_FINAL / boolValue:true", () => {
    const f = treeFilter.allOutputsFinal(true);
    expect(f).toEqual<Filter>({
      key: FilterProperty.ALL_OUTPUTS_FINAL,
      operator: FilterOperatorType.EQUAL,
      value: { oneofKind: "boolValue", boolValue: true },
    });
  });

  test("resourceReadyForCalculation(true) produces EQUAL / RESOURCE_READY_FOR_CALCULATION / boolValue:true", () => {
    const f = treeFilter.resourceReadyForCalculation(true);
    expect(f).toEqual<Filter>({
      key: FilterProperty.RESOURCE_READY_FOR_CALCULATION,
      operator: FilterOperatorType.EQUAL,
      value: { oneofKind: "boolValue", boolValue: true },
    });
  });

  test("isDuplicate(false) produces EQUAL / IS_DUPLICATE / boolValue:false", () => {
    const f = treeFilter.isDuplicate(false);
    expect(f).toEqual<Filter>({
      key: FilterProperty.IS_DUPLICATE,
      operator: FilterOperatorType.EQUAL,
      value: { oneofKind: "boolValue", boolValue: false },
    });
  });

  test("hasErrors(true) produces EQUAL / HAS_ERRORS / boolValue:true", () => {
    const f = treeFilter.hasErrors(true);
    expect(f).toEqual<Filter>({
      key: FilterProperty.HAS_ERRORS,
      operator: FilterOperatorType.EQUAL,
      value: { oneofKind: "boolValue", boolValue: true },
    });
  });

  test("outputsLocked(true) produces EQUAL / OUTPUTS_LOCKED / boolValue:true", () => {
    const f = treeFilter.outputsLocked(true);
    expect(f).toEqual<Filter>({
      key: FilterProperty.OUTPUTS_LOCKED,
      operator: FilterOperatorType.EQUAL,
      value: { oneofKind: "boolValue", boolValue: true },
    });
  });

  test("readyOrDuplicateOrError() produces OR of the three conditions", () => {
    const f = treeFilter.readyOrDuplicateOrError();
    expect(f.operator).toBe(FilterOperatorType.OR);
    if (f.value.oneofKind !== "filtersValue") throw new Error("expected filtersValue");
    const { filters } = f.value.filtersValue;
    expect(filters).toHaveLength(3);
    expect(filters[0]).toEqual<Filter>({
      key: FilterProperty.RESOURCE_READY_FOR_CALCULATION,
      operator: FilterOperatorType.EQUAL,
      value: { oneofKind: "boolValue", boolValue: true },
    });
    expect(filters[1]).toEqual<Filter>({
      key: FilterProperty.IS_DUPLICATE,
      operator: FilterOperatorType.EQUAL,
      value: { oneofKind: "boolValue", boolValue: true },
    });
    expect(filters[2]).toEqual<Filter>({
      key: FilterProperty.HAS_ERRORS,
      operator: FilterOperatorType.EQUAL,
      value: { oneofKind: "boolValue", boolValue: true },
    });
  });

  test("generic eq() and match() use supplied property", () => {
    expect(treeFilter.eq(FilterProperty.RESOURCE_TYPE, "Foo")).toEqual<Filter>({
      key: FilterProperty.RESOURCE_TYPE,
      operator: FilterOperatorType.EQUAL,
      value: { oneofKind: "stringValue", stringValue: "Foo" },
    });
    expect(treeFilter.match(FilterProperty.FIELD_NAME, "^out")).toEqual<Filter>({
      key: FilterProperty.FIELD_NAME,
      operator: FilterOperatorType.MATCH,
      value: { oneofKind: "stringValue", stringValue: "^out" },
    });
  });

  // ── Group operators ────────────────────────────────────────────────────────

  test("and() wraps children in AND / filtersValue", () => {
    const a = treeFilter.resourceTypeEq("A");
    const b = treeFilter.resourceTypeEq("B");
    const f = treeFilter.and(a, b);
    expect(f).toEqual<Filter>({
      operator: FilterOperatorType.AND,
      value: { oneofKind: "filtersValue", filtersValue: { filters: [a, b] } },
    });
    // key must be absent for group operators
    expect(f.key).toBeUndefined();
  });

  test("or() wraps children in OR / filtersValue", () => {
    const a = treeFilter.isFinal(true);
    const b = treeFilter.allOutputsFinal(true);
    const f = treeFilter.or(a, b);
    expect(f).toEqual<Filter>({
      operator: FilterOperatorType.OR,
      value: { oneofKind: "filtersValue", filtersValue: { filters: [a, b] } },
    });
  });

  test("not() wraps single child in NOT / filtersValue", () => {
    const inner = treeFilter.resourceTypeEq("Blob");
    const f = treeFilter.not(inner);
    expect(f).toEqual<Filter>({
      operator: FilterOperatorType.NOT,
      value: { oneofKind: "filtersValue", filtersValue: { filters: [inner] } },
    });
  });

  // ── Nested composition ────────────────────────────────────────────────────

  test("nested AND(RESOURCE_TYPE, IS_FINAL) round-trips correctly", () => {
    // Mirrors the Go-side mustCompileTraverseStopRules usage:
    // AND(RESOURCE_TYPE == "StdMap", IS_FINAL == true)
    const f = treeFilter.and(treeFilter.resourceTypeEq("StdMap"), treeFilter.isFinal(true));

    expect(f.operator).toBe(FilterOperatorType.AND);
    expect(f.key).toBeUndefined();
    if (f.value.oneofKind !== "filtersValue") throw new Error("expected filtersValue");

    const { filters } = f.value.filtersValue;
    expect(filters).toHaveLength(2);

    expect(filters[0]).toEqual<Filter>({
      key: FilterProperty.RESOURCE_TYPE,
      operator: FilterOperatorType.EQUAL,
      value: { oneofKind: "stringValue", stringValue: "StdMap" },
    });
    expect(filters[1]).toEqual<Filter>({
      key: FilterProperty.IS_FINAL,
      operator: FilterOperatorType.EQUAL,
      value: { oneofKind: "boolValue", boolValue: true },
    });
  });

  test("NOT(AND(RESOURCE_TYPE, FIELD_NAME)) used in field_filters", () => {
    // NOT( AND(RESOURCE_TYPE == "BlockPackCustom", FIELD_NAME == "template") )
    const f = treeFilter.not(
      treeFilter.and(
        treeFilter.resourceTypeEq("BlockPackCustom"),
        treeFilter.fieldNameEq("template"),
      ),
    );
    expect(f.operator).toBe(FilterOperatorType.NOT);
    if (f.value.oneofKind !== "filtersValue") throw new Error("expected filtersValue");
    const [andNode] = f.value.filtersValue.filters;
    expect(andNode.operator).toBe(FilterOperatorType.AND);
    if (andNode.value.oneofKind !== "filtersValue") throw new Error("expected filtersValue");
    expect(andNode.value.filtersValue.filters).toHaveLength(2);
  });
});
