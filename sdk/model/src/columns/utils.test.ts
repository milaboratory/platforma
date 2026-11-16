import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  createColumnDiscoveredKey,
  createGlobalPObjectId,
  createLocalPObjectId,
  stringifyColumnDiscoveredId,
  type AxisQualification,
  type PColumnSpec,
  type PObjectId,
  type SpecOverrides,
  type SpecQuery,
  type ColumnUniversalId,
} from "@milaboratories/pl-model-common";
import {
  collectLinkerIds,
  getColumnDataState,
  hasColumnData,
  hitQualifications,
  queriesQualifications,
} from "./utils";
import { ColumnDiscoveredRecipe } from "./column_recipes/column_discovered_recipe";
import { ColumnFilteredRecipe } from "./column_recipes/column_filtered_recipe";
import { ColumnOverriddenRecipe } from "./column_recipes/column_overrided_recipe";
import type { ColumnFieldStatus, ColumnRecipe } from "./column_recipes/types";
import { installStubRegistry, type StubDataField } from "./__test_helpers__/stub_registry";

// ── ctx mock ────────────────────────────────────────────────────────────────
// ColumnDiscoveredRecipe pulls `getCfgRenderCtx()` for `pframeSpec`. Minimal
// no-op stub keeps the constructor happy.

function makeCtx() {
  // Minimal pframeSpec mock — `ColumnFilteredRecipe.wrap` validates axis
  // indices against `inner.getSpec()`, which for a real `ColumnDiscoveredRecipe`
  // runs `createSpecFrame` + `evaluateQuery` through this service. The mock
  // echoes the registered specs as `tableSpec` entries so `getSpec()` returns
  // the spec planted by the discovered fixture.
  const services: Record<string, (...args: unknown[]) => unknown> = {
    // Wrap whatever specs map the caller passes; we don't inspect its shape.
    createSpecFrame: (...args: unknown[]) => ({ key: { specs: args[0] }, unref: () => {} }),
    // Echo the registered specs as `tableSpec` entries — `getSpec` looks up
    // the entry by id, so we need the shape we planted in `createSpecFrame`.
    evaluateQuery: (...args: unknown[]) => {
      const frameKey = args[0] as { specs: Record<string, PColumnSpec> };
      return {
        tableSpec: Object.entries(frameKey.specs).map(([id, spec]) => ({
          type: "column" as const,
          id,
          spec,
        })),
      };
    },
  };
  return {
    getAccessorHandleByName: () => undefined,
    getUpstreamBlockCtx: () => [],
    getServiceNames: () => ["pframeSpec"],
    getServiceMethods: () => Object.keys(services),
    callServiceMethod: (_id: string, method: string, ...args: unknown[]) =>
      services[method]?.(...args),
  } as unknown as never;
}

let activeCtx: ReturnType<typeof makeCtx>;
beforeEach(() => {
  activeCtx = makeCtx();
  (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx = activeCtx;
});

afterEach(() => {
  delete (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx;
});

// ── fixtures ────────────────────────────────────────────────────────────────

const hit = createLocalPObjectId(["main", "out"], "hit");
const linker1 = createLocalPObjectId(["main"], "L1");
const linker2 = createLocalPObjectId(["main"], "L2");
const otherCol = createGlobalPObjectId("block-x", "extra");

const colNode = (c: PObjectId): SpecQuery => ({ type: "column", column: c });

const axisQual = (name: string): AxisQualification => ({ axis: { name }, contextDomain: {} });

const overrides = (patch: Partial<SpecOverrides> = {}): SpecOverrides => ({
  annotations: patch.annotations ?? {},
  domain: patch.domain ?? {},
  contextDomain: patch.contextDomain ?? {},
  axesSpec: patch.axesSpec ?? {},
});

class StubRecipe implements ColumnRecipe<ColumnUniversalId> {
  constructor(
    readonly id: ColumnUniversalId,
    private readonly query: SpecQuery,
  ) {}
  getReferencedIds(): PObjectId[] {
    return [];
  }
  getDataStatus(): ColumnFieldStatus {
    return "present";
  }
  getSpec(): PColumnSpec {
    return { kind: "PColumn", valueType: "String", name: "stub", axesSpec: [] };
  }
  getQuery(): SpecQuery {
    return this.query;
  }
  withSpecs(o: SpecOverrides): ColumnRecipe {
    return ColumnOverriddenRecipe.wrap(this, o);
  }
}

const recipe = (id: PObjectId, query: SpecQuery): ColumnRecipe => new StubRecipe(id, query);

/**
 * Build a real ColumnDiscoveredRecipe from a manually-crafted key. Plants a
 * stub registry that resolves the hit column so {@link
 * ColumnDiscoveredRecipe.fromKey} succeeds without a real ctx.
 */
function discovered(opts: {
  column: PObjectId;
  columnQualifications?: AxisQualification[];
  queriesQualifications?: Record<PObjectId, AxisQualification[]>;
}): ColumnDiscoveredRecipe {
  const distilled = createColumnDiscoveredKey({
    column: opts.column,
    columnQualifications: opts.columnQualifications,
    queriesQualifications: opts.queriesQualifications,
  });
  // Spec with two axes — leaves room for `ColumnFilteredRecipe.wrap` callers
  // in dependent tests (need ≥1 filter and ≥1 remaining axis).
  const stubSpec: PColumnSpec = {
    kind: "PColumn",
    name: "stub",
    valueType: "String",
    axesSpec: [
      { name: "donor", type: "String" },
      { name: "sample", type: "String" },
    ],
    annotations: {},
  };
  installStubRegistry(activeCtx, { [opts.column]: stubSpec });
  const rec = ColumnDiscoveredRecipe.fromKey(distilled);
  if (rec === undefined) throw new Error("discovered fixture: fromKey returned undefined");
  expect(rec.id).toBe(stringifyColumnDiscoveredId(distilled));
  return rec;
}

// ════════════════════════════════════════════════════════════════════════════
// collectLinkerIds
// ════════════════════════════════════════════════════════════════════════════

describe("collectLinkerIds", () => {
  test("leaf recipe → empty", () => {
    expect(collectLinkerIds(recipe(hit, colNode(hit)))).toEqual([]);
  });

  test("linkerJoin chain → linker ids in outer-to-inner order, hit excluded", () => {
    const q: SpecQuery = {
      type: "linkerJoin",
      linker: colNode(linker1),
      secondary: [
        {
          entry: {
            type: "linkerJoin",
            linker: colNode(linker2),
            secondary: [{ entry: colNode(hit) }],
          },
        },
      ],
    };
    expect(collectLinkerIds(recipe(hit, q))).toEqual([linker1, linker2]);
  });

  test("dedupes repeated references", () => {
    const q: SpecQuery = {
      type: "linkerJoin",
      linker: colNode(linker1),
      secondary: [
        {
          entry: {
            type: "linkerJoin",
            linker: colNode(linker1),
            secondary: [{ entry: colNode(hit) }],
          },
        },
      ],
    };
    expect(collectLinkerIds(recipe(hit, q))).toEqual([linker1]);
  });

  test("ignores the hit even when it appears multiple times", () => {
    const q: SpecQuery = {
      type: "innerJoin",
      entries: [{ entry: colNode(hit) }, { entry: colNode(hit) }, { entry: colNode(otherCol) }],
    };
    expect(collectLinkerIds(recipe(hit, q))).toEqual([otherCol]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// hitQualifications / queriesQualifications — recipe-structure walk
// ════════════════════════════════════════════════════════════════════════════

describe("hitQualifications", () => {
  test("leaf recipe → empty list", () => {
    expect(hitQualifications(recipe(hit, colNode(hit)))).toEqual([]);
  });

  test("reads ColumnDiscoveredRecipe.columnQualifications", () => {
    const d = discovered({ column: hit, columnQualifications: [axisQual("sample")] });
    expect(hitQualifications(d)).toEqual([axisQual("sample")]);
  });

  test("descends through Overridden wrapper", () => {
    const d = discovered({ column: hit, columnQualifications: [axisQual("donor")] });
    const wrapped = ColumnOverriddenRecipe.wrap(d, overrides({ annotations: { x: "1" } }));
    expect(hitQualifications(wrapped)).toEqual([axisQual("donor")]);
  });

  test("descends through Filtered wrapper", () => {
    // Filter axis 0 — axis 1 remains, satisfying the wrap invariant.
    const d = discovered({ column: hit, columnQualifications: [axisQual("donor")] });
    const wrapped = ColumnFilteredRecipe.wrap(d, [[0, "v"]]);
    expect(hitQualifications(wrapped)).toEqual([axisQual("donor")]);
  });

  test("descends through stacked Overridden<Filtered<Discovered>>", () => {
    const d = discovered({ column: hit, columnQualifications: [axisQual("donor")] });
    const stacked = ColumnOverriddenRecipe.wrap(
      ColumnFilteredRecipe.wrap(d, [[0, "v"]]),
      overrides({ annotations: { x: "1" } }),
    );
    expect(hitQualifications(stacked)).toEqual([axisQual("donor")]);
  });
});

describe("queriesQualifications", () => {
  test("leaf recipe → empty record", () => {
    expect(queriesQualifications(recipe(hit, colNode(hit)))).toEqual({});
  });

  test("reads ColumnDiscoveredRecipe.queriesQualifications", () => {
    const quals = { [otherCol]: [axisQual("primary-side")] };
    const d = discovered({ column: hit, queriesQualifications: quals });
    expect(queriesQualifications(d)).toEqual(quals);
  });

  test("descends through wrappers", () => {
    const quals = { [otherCol]: [axisQual("primary-side")] };
    const d = discovered({ column: hit, queriesQualifications: quals });
    const wrapped = ColumnOverriddenRecipe.wrap(d, overrides());
    expect(queriesQualifications(wrapped)).toEqual(quals);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// getColumnDataState
// ════════════════════════════════════════════════════════════════════════════

describe("getColumnDataState", () => {
  const first = createLocalPObjectId(["main", "out"], "first");
  const second = createLocalPObjectId(["main", "out"], "second");
  const leafSpec: PColumnSpec = {
    kind: "PColumn",
    name: "stub",
    valueType: "String",
    axesSpec: [],
  };

  /** A recipe that depends on the given leaves, in order. */
  class RefsRecipe extends StubRecipe {
    constructor(private readonly refs: PObjectId[]) {
      super(refs[0], colNode(refs[0]));
    }
    override getReferencedIds(): PObjectId[] {
      return this.refs;
    }
  }

  /** A recipe over leaves whose `.data` fields are in the given states; `undefined` is no field. */
  function recipeOver(leaves: [PObjectId, undefined | StubDataField][]): ColumnRecipe {
    installStubRegistry(
      activeCtx,
      new Map(leaves.map(([id, data]) => [id, { spec: leafSpec, data }])),
    );
    return new RefsRecipe(leaves.map(([id]) => id));
  }

  test("ready when every data resource has bytes", () => {
    const column = recipeOver([
      [first, "ready"],
      [second, "ready"],
    ]);
    expect(getColumnDataState(column)).toBe("ready");
    expect(hasColumnData(column)).toBe(true);
  });

  test.each<undefined | StubDataField>([undefined, "unset", "pending"])(
    "pending for a data field in state %s",
    (data) => {
      const column = recipeOver([[first, data]]);
      expect(getColumnDataState(column)).toBe("pending");
      expect(hasColumnData(column)).toBe(false);
    },
  );

  test.each<StubDataField>(["errored", "erroredWithValue"])(
    "errored for a data field in state %s",
    (data) => {
      const column = recipeOver([[first, data]]);
      expect(getColumnDataState(column)).toBe("errored");
      expect(hasColumnData(column)).toBe(false);
    },
  );

  test("reports the failed data of a leaf that follows a ready one", () => {
    const column = recipeOver([
      [first, "ready"],
      [second, "errored"],
    ]);
    expect(getColumnDataState(column)).toBe("errored");
  });

  test("stops at the first leaf whose data is not ready", () => {
    const column = recipeOver([
      [first, "pending"],
      [second, "errored"],
    ]);
    expect(getColumnDataState(column)).toBe("pending");
  });
});
