import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createLocalPObjectId,
  createColumnOverridedId,
  type AxisId,
  type AxisSpec,
  type PColumnSpec,
  type PObjectId,
  type PTableColumnId,
  type SUniversalPColumnId,
} from "@milaboratories/pl-model-common";
import { ColumnLazyImpl } from "../../columns";
import type { ColumnRecipe } from "../../columns";
import { createColumnResolver } from "./columnResolver";

function wrap(id: PObjectId | SUniversalPColumnId, tag: string): SUniversalPColumnId {
  return createColumnOverridedId({
    source: id,
    specOverrides: { annotations: { tag }, domain: {}, contextDomain: {}, axesSpec: {} },
  });
}

// ColumnLazy constructor pulls `getCfgRenderCtx()` from globalThis on some
// paths — keep a minimal mock the same way p_column_lazy.test.ts does.
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

function lazyOf(id: PObjectId, axes: AxisSpec[] = []) {
  const spec = { kind: "PColumn", name: "stub", axesSpec: axes } as unknown as PColumnSpec;
  return ColumnLazyImpl.fromColumn({
    id,
    spec,
    data: undefined,
  });
}

function axisSpec(name: string): AxisSpec {
  return { type: "String", name } as unknown as AxisSpec;
}

describe("createColumnResolver", () => {
  test("exact lazy id match returns the same id (column)", () => {
    const id = createLocalPObjectId(["main", "out"], "col-1");
    const r = createColumnResolver([lazyOf(id)]);
    const ref: PTableColumnId = { type: "column", id };
    expect(r(ref)).toEqual({ type: "column", id });
  });

  test("bare PObjectId resolves to the recipe's full id", () => {
    const pid = createLocalPObjectId(["main", "out"], "col-1");
    const wrapped = wrap(pid, "A");
    const fake: ColumnRecipe = {
      id: wrapped,
      getReferencedIds: () => [pid],
      getSpec: () => ({ kind: "PColumn", name: "stub", axesSpec: [] }) as unknown as PColumnSpec,
      getQuery: () => ({ type: "column", column: pid }) as never,
      getDataStatus: () => "present",
      withSpecs: () => fake,
    };

    const r = createColumnResolver([fake]);
    const out = r({ type: "column", id: pid });
    expect(out).toEqual({ type: "column", id: wrapped });
  });

  test("axis hit passes through unchanged", () => {
    const ax = axisSpec("sampleId");
    const id = createLocalPObjectId(["main", "out"], "col-1");
    const r = createColumnResolver([lazyOf(id, [ax])]);
    const ref: PTableColumnId = {
      type: "axis",
      id: { type: "String", name: "sampleId" } as AxisId,
    };
    expect(r(ref)).toEqual(ref);
  });

  test("axis miss → undefined", () => {
    const id = createLocalPObjectId(["main", "out"], "col-1");
    const r = createColumnResolver([lazyOf(id, [axisSpec("sampleId")])]);
    const ref: PTableColumnId = { type: "axis", id: { type: "String", name: "missing" } as AxisId };
    expect(r(ref)).toBeUndefined();
  });

  test("column miss → undefined", () => {
    const id = createLocalPObjectId(["main", "out"], "col-1");
    const other = createLocalPObjectId(["main", "out"], "col-2");
    const r = createColumnResolver([lazyOf(id)]);
    expect(r({ type: "column", id: other })).toBeUndefined();
  });

  test("collision warns once and keeps first", () => {
    const pid = createLocalPObjectId(["main", "out"], "col-1");
    const wrappedA = wrap(pid, "A");
    const wrappedB = wrap(pid, "B");
    const makeFake = (wrapped: SUniversalPColumnId): ColumnRecipe => {
      const r: ColumnRecipe = {
        id: wrapped,
        getReferencedIds: () => [pid],
        getSpec: () => ({ kind: "PColumn", name: "stub", axesSpec: [] }) as unknown as PColumnSpec,
        getQuery: () => ({ type: "column", column: pid }) as never,
        getDataStatus: () => "present",
        withSpecs: () => r,
      };
      return r;
    };

    const warn = vi.fn();
    const r = createColumnResolver([makeFake(wrappedA), makeFake(wrappedB)], { warn });
    expect(warn).toHaveBeenCalledTimes(1);
    const out = r({ type: "column", id: pid });
    expect(out).toEqual({ type: "column", id: wrappedA });
  });
});
