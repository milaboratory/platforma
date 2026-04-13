import type { MultiColumnSelector, PColumnSpec } from "@milaboratories/pl-model-common";
import { describe, expect, test } from "vitest";
import type { RelaxedColumnSelector } from "./column_selector";
import {
  matchColumn,
  matchColumnSelectors,
  normalizeSelectors,
  columnSelectorsToPredicate,
} from "./column_selector";
import type { RegExpString } from "@milaboratories/helpers";

// --- Helpers ---

function spec(overrides: Partial<PColumnSpec> & { name: string }): PColumnSpec {
  return {
    kind: "PColumn",
    valueType: "Int",
    axesSpec: [],
    annotations: {},
    ...overrides,
  } as PColumnSpec;
}

// --- normalizeSelectors ---

describe("normalizeSelectors", () => {
  test("wraps single selector in array", () => {
    const result = normalizeSelectors({ name: "foo" });
    expect(result).toHaveLength(1);
    expect(result[0].name).toEqual([{ type: "regex", value: "foo" }]);
  });

  test("passes through array of selectors", () => {
    const result = normalizeSelectors([{ name: "a" }, { name: "b" }]);
    expect(result).toHaveLength(2);
  });

  test("normalizes plain string name to RegexMatcher[]", () => {
    const [sel] = normalizeSelectors({ name: "foo" });
    expect(sel.name).toEqual([{ type: "regex", value: "foo" }]);
  });

  test("normalizes array of mixed strings and matchers", () => {
    const [sel] = normalizeSelectors({
      name: ["foo", { type: "regex", value: "bar.*" as RegExpString }],
    });
    expect(sel.name).toEqual([
      { type: "regex", value: "foo" },
      { type: "regex", value: "bar.*" },
    ]);
  });

  test("normalizes single StringMatcher object", () => {
    const [sel] = normalizeSelectors({ name: { type: "exact", value: "foo" } });
    expect(sel.name).toEqual([{ type: "exact", value: "foo" }]);
  });

  test("normalizes single ValueType to array", () => {
    const [sel] = normalizeSelectors({ type: "Int" });
    expect(sel.type).toEqual(["Int"]);
  });

  test("passes through ValueType array", () => {
    const [sel] = normalizeSelectors({ type: ["Int", "Long"] });
    expect(sel.type).toEqual(["Int", "Long"]);
  });

  test("normalizes record with plain string values", () => {
    const [sel] = normalizeSelectors({
      domain: { "pl7.app/chain": "IGHeavy" },
    });
    expect(sel.domain).toEqual({
      "pl7.app/chain": [{ type: "regex", value: "IGHeavy" }],
    });
  });

  test("normalizes record with mixed array values", () => {
    const [sel] = normalizeSelectors({
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
    const [sel] = normalizeSelectors({
      axes: [{ name: "axisName", type: "String" }],
    });
    expect(sel.axes).toEqual([{ name: [{ type: "regex", value: "axisName" }], type: ["String"] }]);
  });

  test("preserves partialAxesMatch", () => {
    const [sel] = normalizeSelectors({ partialAxesMatch: false });
    expect(sel.partialAxesMatch).toBe(false);
  });

  test("omits undefined fields", () => {
    const [sel] = normalizeSelectors({ name: "foo" });
    expect(sel.type).toBeUndefined();
    expect(sel.domain).toBeUndefined();
    expect(sel.axes).toBeUndefined();
  });
});

// --- matchColumn ---

describe("matchColumn", () => {
  describe("name matching", () => {
    test("exact name match", () => {
      const s = spec({ name: "pl7.app/vdj/sequence" });
      const sel: MultiColumnSelector = { name: [{ type: "exact", value: "pl7.app/vdj/sequence" }] };
      expect(matchColumn(s, sel)).toBe(true);
    });

    test("exact name mismatch", () => {
      const s = spec({ name: "pl7.app/vdj/sequence" });
      const sel: MultiColumnSelector = { name: [{ type: "exact", value: "pl7.app/vdj/other" }] };
      expect(matchColumn(s, sel)).toBe(false);
    });

    test("regex name match", () => {
      const s = spec({ name: "pl7.app/vdj/sequence" });
      const sel: MultiColumnSelector = {
        name: [{ type: "regex", value: "pl7\\.app/vdj/.*" as RegExpString }],
      };
      expect(matchColumn(s, sel)).toBe(true);
    });

    test("regex full match required", () => {
      const s = spec({ name: "pl7.app/vdj/sequence" });
      const sel: MultiColumnSelector = { name: [{ type: "regex", value: "vdj" as RegExpString }] };
      expect(matchColumn(s, sel)).toBe(false);
    });

    test("OR across name matchers", () => {
      const s = spec({ name: "colB" });
      const sel: MultiColumnSelector = {
        name: [
          { type: "exact", value: "colA" },
          { type: "exact", value: "colB" },
        ],
      };
      expect(matchColumn(s, sel)).toBe(true);
    });
  });

  describe("type matching", () => {
    test("single type match", () => {
      const s = spec({ name: "c", valueType: "Int" });
      const sel: MultiColumnSelector = { type: ["Int"] };
      expect(matchColumn(s, sel)).toBe(true);
    });

    test("type mismatch", () => {
      const s = spec({ name: "c", valueType: "String" });
      const sel: MultiColumnSelector = { type: ["Int"] };
      expect(matchColumn(s, sel)).toBe(false);
    });

    test("OR across types", () => {
      const s = spec({ name: "c", valueType: "Long" });
      const sel: MultiColumnSelector = { type: ["Int", "Long"] };
      expect(matchColumn(s, sel)).toBe(true);
    });
  });

  describe("domain matching", () => {
    test("matches column domain", () => {
      const s = spec({ name: "c", domain: { chain: "IGHeavy" } });
      const sel: MultiColumnSelector = {
        domain: { chain: [{ type: "exact", value: "IGHeavy" }] },
      };
      expect(matchColumn(s, sel)).toBe(true);
    });

    test("matches combined domain from axes", () => {
      const s = spec({
        name: "c",
        axesSpec: [
          { name: "axis1", type: "String", domain: { chain: "IGHeavy" }, annotations: {} },
        ] as PColumnSpec["axesSpec"],
      });
      const sel: MultiColumnSelector = {
        domain: { chain: [{ type: "exact", value: "IGHeavy" }] },
      };
      expect(matchColumn(s, sel)).toBe(true);
    });

    test("domain key missing fails", () => {
      const s = spec({ name: "c", domain: {} });
      const sel: MultiColumnSelector = {
        domain: { chain: [{ type: "exact", value: "IGHeavy" }] },
      };
      expect(matchColumn(s, sel)).toBe(false);
    });

    test("multiple domain keys AND-ed", () => {
      const s = spec({ name: "c", domain: { chain: "IGHeavy", species: "human" } });
      const sel: MultiColumnSelector = {
        domain: {
          chain: [{ type: "exact", value: "IGHeavy" }],
          species: [{ type: "exact", value: "human" }],
        },
      };
      expect(matchColumn(s, sel)).toBe(true);
    });

    test("one domain key mismatch fails", () => {
      const s = spec({ name: "c", domain: { chain: "IGHeavy", species: "mouse" } });
      const sel: MultiColumnSelector = {
        domain: {
          chain: [{ type: "exact", value: "IGHeavy" }],
          species: [{ type: "exact", value: "human" }],
        },
      };
      expect(matchColumn(s, sel)).toBe(false);
    });
  });

  describe("annotations matching", () => {
    test("exact annotation match", () => {
      const s = spec({ name: "c", annotations: { label: "CDR3" } });
      const sel: MultiColumnSelector = {
        annotations: { label: [{ type: "exact", value: "CDR3" }] },
      };
      expect(matchColumn(s, sel)).toBe(true);
    });

    test("regex annotation match", () => {
      const s = spec({ name: "c", annotations: { label: "CDR3-length" } });
      const sel: MultiColumnSelector = {
        annotations: { label: [{ type: "regex", value: ".*CDR3.*" as RegExpString }] },
      };
      expect(matchColumn(s, sel)).toBe(true);
    });

    test("missing annotation key fails", () => {
      const s = spec({ name: "c", annotations: {} });
      const sel: MultiColumnSelector = {
        annotations: { label: [{ type: "exact", value: "CDR3" }] },
      };
      expect(matchColumn(s, sel)).toBe(false);
    });
  });

  describe("axes matching", () => {
    const withAxes = (axes: PColumnSpec["axesSpec"]) => spec({ name: "c", axesSpec: axes });

    const axis = (name: string, type: string = "String") =>
      ({ name, type, domain: {}, annotations: {} }) as PColumnSpec["axesSpec"][number];

    test("partial match (default) — selector axis found", () => {
      const s = withAxes([axis("a1"), axis("a2")]);
      const sel: MultiColumnSelector = {
        axes: [{ name: [{ type: "exact", value: "a1" }] }],
      };
      expect(matchColumn(s, sel)).toBe(true);
    });

    test("partial match — selector axis not found", () => {
      const s = withAxes([axis("a1")]);
      const sel: MultiColumnSelector = {
        axes: [{ name: [{ type: "exact", value: "missing" }] }],
      };
      expect(matchColumn(s, sel)).toBe(false);
    });

    test("exact match — same count and order", () => {
      const s = withAxes([axis("a1"), axis("a2")]);
      const sel: MultiColumnSelector = {
        axes: [
          { name: [{ type: "exact", value: "a1" }] },
          { name: [{ type: "exact", value: "a2" }] },
        ],
        partialAxesMatch: false,
      };
      expect(matchColumn(s, sel)).toBe(true);
    });

    test("exact match — wrong order fails", () => {
      const s = withAxes([axis("a1"), axis("a2")]);
      const sel: MultiColumnSelector = {
        axes: [
          { name: [{ type: "exact", value: "a2" }] },
          { name: [{ type: "exact", value: "a1" }] },
        ],
        partialAxesMatch: false,
      };
      expect(matchColumn(s, sel)).toBe(false);
    });

    test("exact match — count mismatch fails", () => {
      const s = withAxes([axis("a1"), axis("a2")]);
      const sel: MultiColumnSelector = {
        axes: [{ name: [{ type: "exact", value: "a1" }] }],
        partialAxesMatch: false,
      };
      expect(matchColumn(s, sel)).toBe(false);
    });

    test("axis type matching", () => {
      const s = withAxes([axis("a1", "Int")]);
      const sel: MultiColumnSelector = {
        axes: [{ type: ["Int"] }],
      };
      expect(matchColumn(s, sel)).toBe(true);
    });

    test("axis domain matching", () => {
      const a = {
        name: "a1",
        type: "String",
        domain: { k: "v" },
        annotations: {},
      } as PColumnSpec["axesSpec"][number];
      const s = withAxes([a]);
      const sel: MultiColumnSelector = {
        axes: [{ domain: { k: [{ type: "exact", value: "v" }] } }],
      };
      expect(matchColumn(s, sel)).toBe(true);
    });
  });

  describe("AND across fields", () => {
    test("all fields must match", () => {
      const s = spec({
        name: "col1",
        valueType: "Int",
        annotations: { label: "x" },
      });
      const sel: MultiColumnSelector = {
        name: [{ type: "exact", value: "col1" }],
        type: ["Int"],
        annotations: { label: [{ type: "exact", value: "x" }] },
      };
      expect(matchColumn(s, sel)).toBe(true);
    });

    test("one field mismatch fails entire selector", () => {
      const s = spec({
        name: "col1",
        valueType: "String",
      });
      const sel: MultiColumnSelector = {
        name: [{ type: "exact", value: "col1" }],
        type: ["Int"],
      };
      expect(matchColumn(s, sel)).toBe(false);
    });
  });

  test("empty selector matches everything", () => {
    const s = spec({ name: "anything", valueType: "Double" });
    expect(matchColumn(s, {})).toBe(true);
  });
});

// --- matchColumnSelectors (OR across array) ---

describe("matchColumnSelectors", () => {
  test("matches if any selector matches", () => {
    const s = spec({ name: "col2" });
    const selectors: MultiColumnSelector[] = [
      { name: [{ type: "exact", value: "col1" }] },
      { name: [{ type: "exact", value: "col2" }] },
    ];
    expect(matchColumnSelectors(selectors, s)).toBe(true);
  });

  test("no match if none match", () => {
    const s = spec({ name: "col3" });
    const selectors: MultiColumnSelector[] = [
      { name: [{ type: "exact", value: "col1" }] },
      { name: [{ type: "exact", value: "col2" }] },
    ];
    expect(matchColumnSelectors(selectors, s)).toBe(false);
  });

  test("empty array matches nothing", () => {
    const s = spec({ name: "col1" });
    expect(matchColumnSelectors([], s)).toBe(false);
  });
});

// --- columnSelectorsToPredicate ---

describe("columnSelectorsToPredicate", () => {
  test("works with relaxed single selector", () => {
    const pred = columnSelectorsToPredicate({ name: "col1" });
    expect(pred(spec({ name: "col1" }))).toBe(true);
    expect(pred(spec({ name: "col2" }))).toBe(false);
  });

  test("works with relaxed array of selectors", () => {
    const pred = columnSelectorsToPredicate([{ name: "col1" }, { name: "col2" }]);
    expect(pred(spec({ name: "col1" }))).toBe(true);
    expect(pred(spec({ name: "col2" }))).toBe(true);
    expect(pred(spec({ name: "col3" }))).toBe(false);
  });

  test("works with regex in relaxed form", () => {
    const pred = columnSelectorsToPredicate({
      name: { type: "regex", value: "col[12]" as RegExpString },
    });
    expect(pred(spec({ name: "col1" }))).toBe(true);
    expect(pred(spec({ name: "col2" }))).toBe(true);
    expect(pred(spec({ name: "col3" }))).toBe(false);
  });

  test("domain filter in relaxed form", () => {
    const pred = columnSelectorsToPredicate({
      domain: { chain: "IGHeavy" },
    });
    expect(pred(spec({ name: "c", domain: { chain: "IGHeavy" } }))).toBe(true);
    expect(pred(spec({ name: "c", domain: { chain: "IGLight" } }))).toBe(false);
    expect(pred(spec({ name: "c" }))).toBe(false);
  });
});

// --- Integration: relaxed selectors end-to-end ---

describe("relaxed selectors end-to-end", () => {
  test("design doc example: name + domain relaxed", () => {
    const input: RelaxedColumnSelector = {
      name: "pl7.app/vdj/sequence",
      domain: { "pl7.app/vdj/chain": "IGHeavy" },
    };
    const [sel] = normalizeSelectors(input);
    const s = spec({
      name: "pl7.app/vdj/sequence",
      domain: { "pl7.app/vdj/chain": "IGHeavy" },
    });
    expect(matchColumn(s, sel)).toBe(true);
  });

  test("design doc example: two selectors OR-ed", () => {
    const input: RelaxedColumnSelector[] = [
      { name: "pl7.app/vdj/sequence" },
      { name: "pl7.app/vdj/geneHit", domain: { "pl7.app/vdj/chain": "IGHeavy" } },
    ];
    const selectors = normalizeSelectors(input);

    expect(matchColumnSelectors(selectors, spec({ name: "pl7.app/vdj/sequence" }))).toBe(true);

    expect(
      matchColumnSelectors(
        selectors,
        spec({ name: "pl7.app/vdj/geneHit", domain: { "pl7.app/vdj/chain": "IGHeavy" } }),
      ),
    ).toBe(true);

    expect(
      matchColumnSelectors(
        selectors,
        spec({ name: "pl7.app/vdj/geneHit", domain: { "pl7.app/vdj/chain": "IGLight" } }),
      ),
    ).toBe(false);
  });

  test("design doc example: domain key with multiple values", () => {
    const pred = columnSelectorsToPredicate({
      domain: { "pl7.app/vdj/chain": ["IGHeavy", "IGLight"] },
    });
    expect(pred(spec({ name: "c", domain: { "pl7.app/vdj/chain": "IGHeavy" } }))).toBe(true);
    expect(pred(spec({ name: "c", domain: { "pl7.app/vdj/chain": "IGLight" } }))).toBe(true);
    expect(pred(spec({ name: "c", domain: { "pl7.app/vdj/chain": "TRA" } }))).toBe(false);
  });
});
