import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  createLocalPObjectId,
  parseColumnOverridedId,
  SpecOverrides,
  type PColumnSpec,
  type PObjectId,
} from "@milaboratories/pl-model-common";
import { ColumnAbsentError, ColumnLazy, ColumnLazyImpl } from "./column_lazy";
import { _ctxProvidersCache } from "./column_providers";
import { installStubRegistry } from "./__test_helpers__/stub_registry";

// --- Ambient ctx mock ------------------------------------------------------
// ColumnLazy constructor pulls `getCfgRenderCtx()` from globalThis. A minimal
// mock with empty index is enough — these tests don't exercise resolve paths.

const mockCtx = {
  getAccessorHandleByName: () => undefined,
  getUpstreamBlockCtx: () => [],
} as unknown as never;

beforeEach(() => {
  (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx = mockCtx;
});

afterEach(() => {
  delete (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx;
});

// --- Helpers ----------------------------------------------------------------

const baseLeaf = createLocalPObjectId(["main", "out"], "col-1");

const stubSpec = { kind: "PColumn", name: "stub" } as unknown as PColumnSpec;

function lazyOf(id: PObjectId, spec: PColumnSpec = stubSpec) {
  return ColumnLazyImpl.fromColumn({ id, spec, data: undefined });
}

// --- clone flattening -------------------------------------------------------

describe("ColumnLazy.clone", () => {
  test("two successive clones produce flat wrap (no nesting)", () => {
    const c0 = lazyOf(baseLeaf);
    const c1 = c0.withSpecs({
      annotations: { a: "1" },
      domain: {},
      contextDomain: {},
      axesSpec: {},
    });
    const c2 = c1.withSpecs({
      annotations: { b: "2" },
      domain: {},
      contextDomain: {},
      axesSpec: {},
    });

    const parsed = parseColumnOverridedId(c2.id);
    // source must be the canonical leaf — not a nested wrap
    expect(parsed.source).toBe(baseLeaf);
    expect(parsed.specOverrides.annotations).toEqual({ a: "1", b: "2" });
  });

  test("idempotent: clone with same overrides twice → same id", () => {
    const c0 = lazyOf(baseLeaf);
    const patch: SpecOverrides = {
      annotations: { x: "1" },
      domain: {},
      contextDomain: {},
      axesSpec: {},
    };
    const a = c0.withSpecs(patch);
    const b = c0.withSpecs(patch);
    expect(a.id).toBe(b.id);
  });
});

// --- spec() override application -------------------------------------------

describe("ColumnLazy.spec — applySpecOverrides", () => {
  test("base spec with no overrides returns readers.spec verbatim", () => {
    const c = lazyOf(baseLeaf);
    expect(c.getSpec()).toBe(stubSpec);
  });

  test("fromId throws ColumnAbsentError when ctx has no handles", () => {
    // Empty registry — `isFinal()` returns true vacuously, so the leaf is
    // provably absent (no provider will ever supply it).
    expect(() => ColumnLazyImpl.fromId(baseLeaf)).toThrow(ColumnAbsentError);
  });

  test("appends axes at indices past base.axesSpec.length", () => {
    const base = {
      kind: "PColumn",
      name: "col",
      valueType: "String",
      axesSpec: [{ name: "group", type: "String" }],
      annotations: {},
    } as unknown as PColumnSpec;
    const c = lazyOf(baseLeaf, base).withSpecs({
      annotations: {},
      domain: {},
      contextDomain: {},
      axesSpec: { 1: { name: "name", type: "String" } },
    });
    expect(c.getSpec().axesSpec).toEqual([
      { name: "group", type: "String" },
      { name: "name", type: "String" },
    ]);
  });

  test("patch on existing axis merges annotations/domain (does not replace whole object)", () => {
    const base = {
      kind: "PColumn",
      name: "col",
      valueType: "String",
      axesSpec: [{ name: "group", type: "String", annotations: { k1: "v1" } }],
      annotations: {},
    } as unknown as PColumnSpec;
    const c = lazyOf(baseLeaf, base).withSpecs({
      annotations: {},
      domain: {},
      contextDomain: {},
      axesSpec: { 0: { annotations: { k2: "v2" } } },
    });
    expect(c.getSpec().axesSpec[0].annotations).toEqual({ k1: "v1", k2: "v2" });
  });
});

// --- resolution status / absent throw --------------------------------------

describe("ColumnLazy resolution: fromId / fromAccessor / getStatus", () => {
  test("fromId returns undefined when registry is unfinalized and id not found", () => {
    // `isFinal: false` → resolver can't tell yet → resolving → undefined.
    installStubRegistry(mockCtx, {}, { isFinal: false });
    expect(ColumnLazyImpl.fromId(baseLeaf)).toBeUndefined();
  });

  test("fromId throws ColumnAbsentError when leaf has no spec field on locked accessor", () => {
    // Leaf entry present, no spec field, accessor locked → absent forever.
    installStubRegistry(mockCtx, { [baseLeaf]: { accessorLocked: true } });
    expect(() => ColumnLazyImpl.fromId(baseLeaf)).toThrow(ColumnAbsentError);
  });

  test("fromId returns undefined when leaf has no spec field on unlocked accessor", () => {
    // Leaf entry present, no spec field, accessor unlocked → spec may still arrive.
    installStubRegistry(mockCtx, { [baseLeaf]: { accessorLocked: false } });
    expect(ColumnLazyImpl.fromId(baseLeaf)).toBeUndefined();
  });

  test("fromId returns undefined when spec accessor exists but hasData is false", () => {
    // Spec resource present, bytes not yet written — transient resolving.
    installStubRegistry(mockCtx, { [baseLeaf]: { spec: stubSpec, specHasData: false } });
    expect(ColumnLazyImpl.fromId(baseLeaf)).toBeUndefined();
  });

  test("fromAccessor throws ColumnAbsentError when accessor is locked without spec", () => {
    installStubRegistry(mockCtx, { [baseLeaf]: { accessorLocked: true } });
    const entry = pluckLeafEntry(baseLeaf);
    expect(() => ColumnLazyImpl.fromAccessor(entry)).toThrow(ColumnAbsentError);
  });

  test("fromAccessor returns undefined when accessor is unlocked without spec", () => {
    installStubRegistry(mockCtx, { [baseLeaf]: { accessorLocked: false } });
    const entry = pluckLeafEntry(baseLeaf);
    expect(ColumnLazyImpl.fromAccessor(entry)).toBeUndefined();
  });

  test("getStatusById returns 'absent' / 'resolving' / 'present' across configurations", () => {
    // present — spec with data on a locked, populated leaf.
    installStubRegistry(mockCtx, { [baseLeaf]: stubSpec });
    expect(ColumnLazy.getStatusById(baseLeaf)).toBe("present");

    // resolving — same leaf id, spec bytes not yet written.
    installStubRegistry(mockCtx, { [baseLeaf]: { spec: stubSpec, specHasData: false } });
    expect(ColumnLazy.getStatusById(baseLeaf)).toBe("resolving");

    // resolving — leaf entry exists but spec field missing on an unlocked accessor.
    installStubRegistry(mockCtx, { [baseLeaf]: { accessorLocked: false } });
    expect(ColumnLazy.getStatusById(baseLeaf)).toBe("resolving");

    // absent — leaf entry exists with no spec field on a locked accessor.
    installStubRegistry(mockCtx, { [baseLeaf]: { accessorLocked: true } });
    expect(ColumnLazy.getStatusById(baseLeaf)).toBe("absent");

    // absent — id not in any provider and registry is final.
    installStubRegistry(mockCtx, {}, { isFinal: true });
    expect(ColumnLazy.getStatusById(baseLeaf)).toBe("absent");

    // resolving — id not in any provider but registry still enumerating.
    installStubRegistry(mockCtx, {}, { isFinal: false });
    expect(ColumnLazy.getStatusById(baseLeaf)).toBe("resolving");
  });
});

/** Pull the `LeafEntry` planted by the stub registry for a given id. */
function pluckLeafEntry(id: PObjectId) {
  const entry = _ctxProvidersCache.get(mockCtx)?.[0]?.getPObjectEntries().get(id);
  if (entry === undefined) throw new Error(`pluckLeafEntry: no entry for ${id}`);
  return entry;
}
