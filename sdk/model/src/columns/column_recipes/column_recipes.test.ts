import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  createColumnDiscoveredKey,
  createColumnFilteredKey,
  createColumnOverriddenId,
  createColumnOverriddenKey,
  createGlobalPObjectId,
  createLocalPObjectId,
  isFilteredPColumn,
  isColumnOverriddenKey,
  isColumnDiscoveredKey,
  parseColumnIdSafety,
  parseColumnOverriddenId,
  stringifyColumnDiscoveredId,
  stringifyColumnFilteredId,
  type ColumnDiscoveredKey,
  type PColumnSpec,
  type PObjectId,
  type SpecOverrides,
  type SpecQuery,
  type ColumnUniversalId,
} from "@milaboratories/pl-model-common";
import { ColumnDiscoveredRecipe } from "./column_discovered_recipe";
import { ColumnOverriddenRecipe } from "./column_overrided_recipe";
import { ColumnFilteredRecipe } from "./column_filtered_recipe";
import { ColumnRecipe } from "./index";
import { ColumnAbsentError } from "../column_lazy";
import type { ColumnFieldStatus } from "./types";
import { installStubRegistry } from "../__test_helpers__/stub_registry";
import { throwError } from "@milaboratories/helpers";

// ── ctx mock ────────────────────────────────────────────────────────────────
// Recipe constructors pull `getCfgRenderCtx()` from globalThis. A minimal
// mock with a no-op service dispatch is enough so that
// `new ColumnDiscoveredRecipe` does not throw in the constructor
// (getService("pframeSpec")).

function makeCtx(opts: { serviceMethods?: Record<string, (...args: unknown[]) => unknown> } = {}) {
  const methods = opts.serviceMethods ?? {};
  return {
    getAccessorHandleByName: () => undefined,
    getUpstreamBlockCtx: () => [],
    getServiceNames: () => ["pframeSpec"],
    getServiceMethods: () => Object.keys(methods),
    callServiceMethod: (_id: string, method: string, ...args: unknown[]) =>
      methods[method]?.(...args),
  } as unknown as never;
}

beforeEach(() => {
  const ctx = makeCtx();
  (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx = ctx;
});

afterEach(() => {
  delete (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx;
});

/** Install a fresh cfgRenderCtx (optionally pframeSpec-aware) plus a stub
 *  registry resolving the given (id → spec) map. */
function setupCtx(
  specs: Record<PObjectId, PColumnSpec>,
  opts: Parameters<typeof makeCtx>[0] = {},
): void {
  const ctx = makeCtx(opts);
  (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx = ctx;
  installStubRegistry(ctx, specs);
}

// ── fixtures ────────────────────────────────────────────────────────────────

const baseLeaf = createLocalPObjectId(["main", "out"], "col-1");
const linkerId = createLocalPObjectId(["main"], "L1");

const stubSpec = (
  axes: { name: string; type: string; domain?: Record<string, string> }[] = [],
): PColumnSpec =>
  ({
    kind: "PColumn",
    name: "stub",
    valueType: "String",
    axesSpec: axes,
    annotations: {},
  }) as unknown as PColumnSpec;

const overrides = (patch: Partial<SpecOverrides>): SpecOverrides => ({
  annotations: patch.annotations ?? {},
  domain: patch.domain ?? {},
  contextDomain: patch.contextDomain ?? {},
  axesSpec: patch.axesSpec ?? {},
});

/**
 * Minimal `ColumnRecipe` stub — lets us test Overridden/Filtered without
 * ctx mocking and without touching the pframeSpec service.
 */
class StubRecipe implements ColumnRecipe<ColumnUniversalId> {
  constructor(
    readonly id: ColumnUniversalId,
    private readonly state: {
      spec?: PColumnSpec;
      query?: SpecQuery;
      refs?: PObjectId[];
      status?: ColumnFieldStatus;
    } = {},
  ) {}

  getReferencedIds(): PObjectId[] {
    return this.state.refs ?? [this.id as unknown as PObjectId];
  }
  getDataStatus(): ColumnFieldStatus {
    return this.state.status ?? "present";
  }
  getSpec(): PColumnSpec {
    if (this.state.spec === undefined) throw new Error("StubRecipe: no stub spec");
    return this.state.spec;
  }
  getQuery(): SpecQuery {
    if (!this.state.query) throw new Error("StubRecipe: no stub query");
    return this.state.query;
  }
  withSpecs(o: SpecOverrides): ColumnRecipe {
    return ColumnOverriddenRecipe.wrap(this, o);
  }
}

const leafQuery: SpecQuery = { type: "column", column: baseLeaf } as SpecQuery;

const stubInner = (state: ConstructorParameters<typeof StubRecipe>[1] = {}) =>
  new StubRecipe(baseLeaf as unknown as ColumnUniversalId, state);

// ════════════════════════════════════════════════════════════════════════════
// ColumnOverriddenRecipe
// ════════════════════════════════════════════════════════════════════════════

describe("ColumnOverriddenRecipe", () => {
  test("wrap(plain inner): id is Overridden{source: inner.id, specOverrides}", () => {
    const inner = stubInner();
    const ov = overrides({ annotations: { a: "1" } });
    const wrapped = ColumnOverriddenRecipe.wrap(inner, ov);
    const parsed = parseColumnOverriddenId(wrapped.id);
    expect(parsed.__isOverridden).toBe(true);
    expect(parsed.source).toBe(inner.id);
    expect(parsed.specOverrides.annotations).toEqual({ a: "1" });
  });

  test("wrap on already-Overridden → flat merge (single layer, merged overrides)", () => {
    const inner = stubInner();
    const a = ColumnOverriddenRecipe.wrap(inner, overrides({ annotations: { x: "1" } }));
    const b = ColumnOverriddenRecipe.wrap(a, overrides({ annotations: { y: "2" } }));

    const parsed = parseColumnOverriddenId(b.id);
    // source is the leaf, not a nested Overridden
    expect(parsed.source).toBe(inner.id);
    expect(parsed.specOverrides.annotations).toEqual({ x: "1", y: "2" });

    // and source itself is not an Overridden wrap
    const innerParsed = parseColumnIdSafety(parsed.source);
    expect(innerParsed === undefined || !isColumnOverriddenKey(innerParsed)).toBe(true);
  });

  test("withSpecs(o1).withSpecs(o2) has same id as withSpecs(merge(o1,o2))", () => {
    const inner = stubInner();
    const a = ColumnOverriddenRecipe.wrap(inner, overrides({ annotations: { a: "1" } })).withSpecs(
      overrides({ annotations: { b: "2" } }),
    );
    const b = ColumnOverriddenRecipe.wrap(inner, overrides({ annotations: { a: "1", b: "2" } }));
    expect(a.id).toBe(b.id);
  });

  test("getSpec applies overrides to inner.getSpec()", () => {
    const inner = stubInner({ spec: stubSpec() });
    const wrapped = ColumnOverriddenRecipe.wrap(inner, overrides({ annotations: { a: "1" } }));
    expect(wrapped.getSpec().annotations).toEqual({ a: "1" });
  });

  test("getSpec propagates throws from inner.getSpec()", () => {
    // Inner without a stubbed spec throws — Overridden forwards the error.
    const inner = stubInner({ spec: undefined });
    expect(() =>
      ColumnOverriddenRecipe.wrap(inner, overrides({ annotations: { a: "1" } })).getSpec(),
    ).toThrow(/no stub spec/);
  });

  test("getReferencedIds / getDataStatus forward to inner", () => {
    const refs = [baseLeaf, linkerId];
    const inner = stubInner({
      query: leafQuery,
      refs,
      status: "resolving",
    });
    const wrapped = ColumnOverriddenRecipe.wrap(inner, overrides({ annotations: { a: "1" } }));
    expect(wrapped.getReferencedIds()).toEqual(refs);
    expect(wrapped.getDataStatus()).toBe("resolving");
  });

  test("getQuery wraps inner query in a specOverride node carrying the overrides", () => {
    const inner = stubInner({ query: leafQuery });
    const ov = overrides({ annotations: { a: "1" } });
    const wrapped = ColumnOverriddenRecipe.wrap(inner, ov);
    const query = wrapped.getQuery();
    expect(query.type).toBe("specOverride");
    if (query.type === "specOverride") {
      // Inner leaf gets rebranded to the Overridden id so every variant of the
      // same physical column produces a distinct leaf for the engine.
      expect(query.input).toEqual({ type: "column", column: wrapped.id });
      expect(query.override).toBe(ov);
    }
  });

  test("getQuery is cached: repeated calls return the same node", () => {
    const inner = stubInner({ query: leafQuery });
    const wrapped = ColumnOverriddenRecipe.wrap(inner, overrides({ annotations: { a: "1" } }));
    expect(wrapped.getQuery()).toBe(wrapped.getQuery());
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ColumnFilteredRecipe
// ════════════════════════════════════════════════════════════════════════════

describe("ColumnFilteredRecipe", () => {
  test("wrap(plain inner): id is FilteredPColumnId{source, axisFilters}", () => {
    // Two axes so the filter on axis 0 leaves axis 1 — wrap rejects filters
    // that fix every axis (an empty axis set has no useful column).
    const inner = stubInner({
      spec: stubSpec([
        { name: "a", type: "String" },
        { name: "b", type: "String" },
      ]),
    });
    const filtered = ColumnFilteredRecipe.wrap(inner, [[0, "v1"]]);
    const parsed = parseColumnIdSafety(filtered.id);
    expect(parsed && isFilteredPColumn(parsed)).toBe(true);
    if (parsed && isFilteredPColumn(parsed)) {
      expect(parsed.source).toBe(inner.id);
      expect(parsed.axisFilters).toEqual([[0, "v1"]]);
    }
  });

  test("wrap on already-Filtered → flat concat axisFilters", () => {
    // Three axes so two stacked filters (axes 0, 1) leave axis 2.
    const inner = stubInner({
      spec: stubSpec([
        { name: "a", type: "String" },
        { name: "b", type: "String" },
        { name: "c", type: "String" },
      ]),
    });
    const a = ColumnFilteredRecipe.wrap(inner, [[0, "v1"]]);
    const b = ColumnFilteredRecipe.wrap(a, [[1, "v2"]]);
    const parsed = parseColumnIdSafety(b.id);
    expect(parsed && isFilteredPColumn(parsed)).toBe(true);
    if (parsed && isFilteredPColumn(parsed)) {
      expect(parsed.source).toBe(inner.id);
      expect(parsed.axisFilters).toEqual([
        [0, "v1"],
        [1, "v2"],
      ]);
    }
  });

  test("getSpec projects axes — drops by indices from axisFilters", () => {
    const inner = stubInner({
      spec: stubSpec([
        { name: "sample", type: "String" },
        { name: "gene", type: "String" },
        { name: "rep", type: "Int" },
      ]),
    });
    const filtered = ColumnFilteredRecipe.wrap(inner, [
      [0, "S1"],
      [2, 3],
    ]);
    expect(filtered.getSpec().axesSpec).toEqual([{ name: "gene", type: "String" }]);
  });

  test("wrap throws when no axis filter is provided", () => {
    // The no-op `wrap(inner, [])` form is rejected at construction: a
    // Filtered without filters has no projection over the inner and would
    // collapse to identity in the wrapper chain.
    const inner = stubInner({
      spec: stubSpec([{ name: "a", type: "String" }]),
      query: leafQuery,
    });
    expect(() => ColumnFilteredRecipe.wrap(inner, [])).toThrow(
      /at least one axis filter must be provided/,
    );
  });

  test("wrap throws when filters fix every axis", () => {
    // A filter set that fixes every axis would leave a 0-axis projection —
    // not a useful column. Construction-time validation rejects it.
    const inner = stubInner({
      spec: stubSpec([{ name: "a", type: "String" }]),
      query: leafQuery,
    });
    expect(() => ColumnFilteredRecipe.wrap(inner, [[0, "v"]])).toThrow(
      /at least one axis must remain/,
    );
  });

  test("getQuery builds SpecQuerySliceAxes with correct selectors derived from indices", () => {
    const inner = stubInner({
      spec: stubSpec([
        { name: "sample", type: "String", domain: { kind: "patient" } },
        { name: "gene", type: "String" },
      ]),
      query: leafQuery,
    });
    const filtered = ColumnFilteredRecipe.wrap(inner, [[0, "S1"]]);
    const q = filtered.getQuery() as { type: string; input: SpecQuery; axisFilters: unknown[] };
    expect(q.type).toBe("sliceAxes");
    // Inner leaf gets rebranded to the Filtered id so the engine sees a
    // distinct column for each axis-slice variant of the same physical hit.
    expect(q.input).toEqual({ type: "column", column: filtered.id });
    expect(q.axisFilters).toEqual([
      {
        axisSelector: { name: "sample", type: "String", domain: { kind: "patient" } },
        constant: "S1",
      },
    ]);
  });

  test("wrap throws on out-of-range axis index (validated at construction)", () => {
    const inner = stubInner({
      spec: stubSpec([{ name: "a", type: "String" }]),
      query: leafQuery,
    });
    expect(() => ColumnFilteredRecipe.wrap(inner, [[5, "v"]])).toThrow(/out of range/);
  });

  test("withSpecs → Overridden<Filtered<inner>> (Overridden on the outside)", () => {
    const inner = stubInner({
      spec: stubSpec([
        { name: "a", type: "String" },
        { name: "b", type: "String" },
      ]),
    });
    const filtered = ColumnFilteredRecipe.wrap(inner, [[0, "v"]]);
    const layered = filtered.withSpecs(overrides({ annotations: { a: "1" } }));

    const parsedOuter = parseColumnIdSafety(layered.id);
    expect(parsedOuter && isColumnOverriddenKey(parsedOuter)).toBe(true);
    if (parsedOuter && isColumnOverriddenKey(parsedOuter)) {
      const parsedInner = parseColumnIdSafety(parsedOuter.source);
      expect(parsedInner && isFilteredPColumn(parsedInner)).toBe(true);
    }
  });

  test("getReferencedIds / getDataStatus forward to inner", () => {
    const refs = [baseLeaf, linkerId];
    const inner = stubInner({
      refs,
      status: "absent",
      spec: stubSpec([
        { name: "a", type: "String" },
        { name: "b", type: "String" },
      ]),
    });
    const filtered = ColumnFilteredRecipe.wrap(inner, [[0, "v"]]);
    expect(filtered.getReferencedIds()).toEqual(refs);
    expect(filtered.getDataStatus()).toBe("absent");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ColumnDiscoveredRecipe (id / refs / transformations / getSpec pass-through).
// getQuery is covered separately; getSpec no longer needs the engine.
// ════════════════════════════════════════════════════════════════════════════

describe("ColumnDiscoveredRecipe", () => {
  const trivialKey: ColumnDiscoveredKey = createColumnDiscoveredKey({ column: baseLeaf });

  test("fromKey throws on an empty column id (unrecognized id variant)", () => {
    // Empty string isn't a valid `ColumnUniversalId` — `parseColumnIdSafety`
    // returns undefined and the dispatcher falls through to the "unsupported
    // variant" throw rather than silently returning undefined.
    expect(() =>
      ColumnDiscoveredRecipe.fromKey(createColumnDiscoveredKey({ column: "" as PObjectId })),
    ).toThrow(/Unsupported ColumnRecipe id variant/);
  });

  test("fromKey propagates ColumnAbsentError from a referenced absent column", () => {
    // Default ctx mock has no providers → empty registry → leaf id is provably
    // absent. The leaf-level throw inside `Column(uniId, opts)` propagates
    // unchanged through `fromKey`.
    expect(() => ColumnDiscoveredRecipe.fromKey(trivialKey)).toThrow(ColumnAbsentError);
  });

  test("id is the canonical stringify(ColumnDiscoveredKey)", () => {
    setupCtx({ [baseLeaf]: stubSpec() });
    const r =
      ColumnDiscoveredRecipe.fromKey(trivialKey) ?? throwError("fromKey returned undefined");
    const parsed = parseColumnIdSafety(r.id);
    expect(parsed && isColumnDiscoveredKey(parsed)).toBe(true);
    if (parsed && isColumnDiscoveredKey(parsed)) {
      expect(parsed.column).toBe(baseLeaf);
    }
  });

  test("getHitId returns key.column", () => {
    setupCtx({ [baseLeaf]: stubSpec() });
    const r =
      ColumnDiscoveredRecipe.fromKey(trivialKey) ?? throwError("fromKey returned undefined");
    expect(r.getHitId()).toBe(baseLeaf);
  });

  test("getReferencedIds: hit + path linkers, deduplicated", () => {
    const linker2 = createGlobalPObjectId("blk", "L2");
    setupCtx({ [baseLeaf]: stubSpec(), [linkerId]: stubSpec(), [linker2]: stubSpec() });
    const r =
      ColumnDiscoveredRecipe.fromKey(
        createColumnDiscoveredKey({
          column: baseLeaf,
          path: [
            { type: "linker", column: linkerId },
            { type: "linker", column: linker2 },
            { type: "linker", column: linkerId }, // duplicate
          ],
        }),
      ) ?? throwError("fromKey returned undefined");
    const refs = r.getReferencedIds().sort();
    expect(refs).toEqual([baseLeaf, linkerId, linker2].sort());
  });

  test("getSpec is the hit column's own spec, unaffected by the linker path", () => {
    const linker2 = createGlobalPObjectId("blk", "L2");
    const hitSpec = stubSpec([
      { name: "group", type: "String" },
      { name: "name", type: "String" },
    ]);
    setupCtx({ [baseLeaf]: hitSpec, [linkerId]: stubSpec(), [linker2]: stubSpec() });
    const r =
      ColumnDiscoveredRecipe.fromKey(
        createColumnDiscoveredKey({
          column: baseLeaf,
          path: [
            { type: "linker", column: linkerId },
            { type: "linker", column: linker2 },
          ],
        }),
      ) ?? throwError("fromKey returned undefined");
    // Pass-through: the linker chain enables co-indexing but does not remap
    // the hit's axesSpec, so getSpec === the hit recipe's spec.
    expect(r.getSpec().axesSpec).toEqual(hitSpec.axesSpec);
  });

  test("withSpecs → Overridden<Discovered>, flat-merge on repeat", () => {
    setupCtx({ [baseLeaf]: stubSpec() });
    const r =
      ColumnDiscoveredRecipe.fromKey(trivialKey) ?? throwError("fromKey returned undefined");
    const a = r.withSpecs(overrides({ annotations: { x: "1" } }));
    const b = a.withSpecs(overrides({ annotations: { y: "2" } }));

    const parsed = parseColumnOverriddenId(b.id);
    expect(parsed.specOverrides.annotations).toEqual({ x: "1", y: "2" });

    // source must be Discovered, not Overridden
    const inner = parseColumnIdSafety(parsed.source);
    expect(inner && isColumnDiscoveredKey(inner)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Static resolution status (getStatusByKey + ColumnRecipe.getStatus dispatcher)
// — verifies the new contract: status answered before construction; worst-wins
// aggregation; absent throw propagates through recursive id resolution.
// ════════════════════════════════════════════════════════════════════════════

describe("ColumnDiscoveredRecipe.getStatusByKey (worst-wins across references)", () => {
  const hit = createLocalPObjectId(["main", "out"], "hit");
  const linker = createLocalPObjectId(["main"], "linker");

  test("present when hit and every linker are present", () => {
    setupCtx({ [hit]: stubSpec(), [linker]: stubSpec() });
    expect(
      ColumnDiscoveredRecipe.getStatusByKey(
        createColumnDiscoveredKey({
          column: hit,
          path: [{ type: "linker", column: linker }],
        }),
      ),
    ).toBe("present");
  });

  test("resolving when any reference is still resolving (hit present, linker resolving)", () => {
    const ctx = makeCtx();
    (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx = ctx;
    installStubRegistry(ctx, {
      [hit]: stubSpec(),
      [linker]: { accessorLocked: false }, // resolving
    });
    expect(
      ColumnDiscoveredRecipe.getStatusByKey(
        createColumnDiscoveredKey({
          column: hit,
          path: [{ type: "linker", column: linker }],
        }),
      ),
    ).toBe("resolving");
  });

  test("absent when any reference is provably absent (hit present, linker absent)", () => {
    const ctx = makeCtx();
    (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx = ctx;
    installStubRegistry(ctx, {
      [hit]: stubSpec(),
      [linker]: { accessorLocked: true }, // absent
    });
    expect(
      ColumnDiscoveredRecipe.getStatusByKey(
        createColumnDiscoveredKey({
          column: hit,
          path: [{ type: "linker", column: linker }],
        }),
      ),
    ).toBe("absent");
  });
});

describe("Wrapper getStatusByKey delegates to source", () => {
  test("ColumnFilteredRecipe.getStatusByKey returns the source's status", () => {
    setupCtx({ [baseLeaf]: stubSpec([{ name: "axis", type: "String" }]) });
    expect(
      ColumnFilteredRecipe.getStatusByKey(
        createColumnFilteredKey({ source: baseLeaf, axisFilters: [] }),
      ),
    ).toBe("present");

    // Now make the source absent — wrapper status follows.
    const ctx = makeCtx();
    (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx = ctx;
    installStubRegistry(ctx, { [baseLeaf]: { accessorLocked: true } });
    expect(
      ColumnFilteredRecipe.getStatusByKey(
        createColumnFilteredKey({ source: baseLeaf, axisFilters: [] }),
      ),
    ).toBe("absent");
  });

  test("ColumnOverriddenRecipe.getStatusByKey returns the source's status", () => {
    setupCtx({ [baseLeaf]: stubSpec() });
    expect(
      ColumnOverriddenRecipe.getStatusByKey(
        createColumnOverriddenKey({ source: baseLeaf, specOverrides: overrides({}) }),
      ),
    ).toBe("present");

    const ctx = makeCtx();
    (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx = ctx;
    installStubRegistry(ctx, {}, { isFinal: false });
    expect(
      ColumnOverriddenRecipe.getStatusByKey(
        createColumnOverriddenKey({ source: baseLeaf, specOverrides: overrides({}) }),
      ),
    ).toBe("resolving");
  });
});

describe("ColumnRecipe.getStatus (top-level dispatcher)", () => {
  test("routes bare PObjectId to ColumnLazyImpl.getStatusById", () => {
    setupCtx({ [baseLeaf]: stubSpec() });
    expect(ColumnRecipe.getStatus(baseLeaf)).toBe("present");
  });

  test("routes ColumnDiscoveredKey id to ColumnDiscoveredRecipe.getStatusByKey", () => {
    setupCtx({ [baseLeaf]: stubSpec() });
    const id = stringifyColumnDiscoveredId({ column: baseLeaf });
    expect(ColumnRecipe.getStatus(id)).toBe("present");
  });

  test("routes ColumnFilteredKey id to ColumnFilteredRecipe.getStatusByKey", () => {
    setupCtx({ [baseLeaf]: stubSpec([{ name: "axis", type: "String" }]) });
    const id = stringifyColumnFilteredId({
      source: baseLeaf,
      axisFilters: [],
    });
    expect(ColumnRecipe.getStatus(id)).toBe("present");
  });

  test("routes ColumnOverriddenKey id to ColumnOverriddenRecipe.getStatusByKey", () => {
    setupCtx({ [baseLeaf]: stubSpec() });
    const id = createColumnOverriddenId({
      source: baseLeaf,
      specOverrides: overrides({}),
    });
    expect(ColumnRecipe.getStatus(id)).toBe("present");
  });
});

describe("ColumnRecipe(id) throw propagation on absent leaves", () => {
  test("filtered id over an absent source throws ColumnAbsentError", () => {
    // Empty registry with isFinal=true → leaf is provably absent → throw
    // propagates through the Filtered dispatch branch.
    const ctx = makeCtx();
    (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx = ctx;
    installStubRegistry(ctx, {}, { isFinal: true });
    const id = stringifyColumnFilteredId({
      source: baseLeaf,
      axisFilters: [],
    });
    expect(() => ColumnRecipe(id)).toThrow(ColumnAbsentError);
  });

  test("overrided id over an absent source throws ColumnAbsentError", () => {
    const ctx = makeCtx();
    (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx = ctx;
    installStubRegistry(ctx, {}, { isFinal: true });
    const id = createColumnOverriddenId({
      source: baseLeaf,
      specOverrides: overrides({}),
    });
    expect(() => ColumnRecipe(id)).toThrow(ColumnAbsentError);
  });

  test("discovered id over an absent hit throws ColumnAbsentError", () => {
    const ctx = makeCtx();
    (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx = ctx;
    installStubRegistry(ctx, {}, { isFinal: true });
    const id = stringifyColumnDiscoveredId({ column: baseLeaf });
    expect(() => ColumnRecipe(id)).toThrow(ColumnAbsentError);
  });
});

describe("ColumnDiscoveredRecipe.getQuery (local assembly)", () => {
  test("trivial (no path) → leaf column query with the Discovered id", () => {
    // `buildSpecQuery` no longer delegates to `pframeSpec.buildQuery`; it
    // assembles the SpecQuery locally and rebrands the hit leaf to `this.id`
    // so sibling variants of the same physical hit stay distinguishable.
    const ctx = makeCtx();
    (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx = ctx;
    installStubRegistry(ctx, { [baseLeaf]: stubSpec() });

    const r =
      ColumnDiscoveredRecipe.fromKey(createColumnDiscoveredKey({ column: baseLeaf })) ??
      throwError("fromKey returned undefined");
    expect(r.getQuery()).toEqual({ type: "column", column: r.id });
  });

  test("with linker path → linkerJoin nesting, hit leaf rebranded to the Discovered id", () => {
    const ctx = makeCtx();
    (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx = ctx;
    installStubRegistry(ctx, { [baseLeaf]: stubSpec(), [linkerId]: stubSpec() });

    const r =
      ColumnDiscoveredRecipe.fromKey(
        createColumnDiscoveredKey({
          column: baseLeaf,
          path: [{ type: "linker", column: linkerId }],
        }),
      ) ?? throwError("fromKey returned undefined");
    expect(r.getQuery()).toEqual({
      type: "linkerJoin",
      linker: { type: "column", column: linkerId },
      secondary: [{ entry: { type: "column", column: r.id } }],
    });
  });
});
