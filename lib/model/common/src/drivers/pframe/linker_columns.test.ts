import {
  Annotation,
  AxisSpec,
  AxisSpecNormalized,
  getArrayFromAxisTree,
  getAxesTree,
  getNormalizedAxesList,
  getSetFromAxisTree,
  PColumnIdAndSpec,
  ValueType,
} from "./spec/index";
import { PObjectId } from "../../pool";
import { stringifyJson } from "../../json";
import { describe, expect, test } from "vitest";
import { LinkerMap } from "./linker_columns";

function makeTestAxis(params: { name: string; parents?: AxisSpec[] }): AxisSpec {
  return {
    type: ValueType.Int,
    name: params.name,
    annotations: {
      [Annotation.Label]: `${params.name} axis`,
      ...(params.parents && params.parents.length > 0
        ? { [Annotation.Parents]: stringifyJson(params.parents.map((p) => p.name)) }
        : {}),
    } satisfies Annotation,
  };
}

function makeLinkerColumn(params: {
  name: string;
  from: AxisSpec[];
  to: AxisSpec[];
}): PColumnIdAndSpec {
  return {
    columnId: params.name as PObjectId,
    spec: {
      kind: "PColumn",
      valueType: ValueType.String,
      name: params.name,
      axesSpec: [...params.from, ...params.to],
      annotations: {
        [Annotation.Label]: `${params.name} column`,
        [Annotation.IsLinkerColumn]: stringifyJson(true),
      } satisfies Annotation,
    },
  };
}

/** Returns all permutations of initial array */
function allPermutations<T>(arr: T[]): T[][] {
  switch (arr.length) {
    case 0:
      return [];
    case 1:
      return [arr];
    case 2:
      return [arr, [arr[1], arr[0]]];
    default:
      return arr.reduce(
        (acc, item, i) =>
          acc.concat(
            allPermutations<T>([...arr.slice(0, i), ...arr.slice(i + 1)]).map((val) => [
              item,
              ...val,
            ]),
          ),
        [] as T[][],
      );
  }
}

describe("Linker columns", () => {
  test("Search in linker columns map", () => {
    const [axis1, axis2, axis3, axis4, axis5] = getNormalizedAxesList([
      makeTestAxis({ name: "id1" }),
      makeTestAxis({ name: "id2" }),
      makeTestAxis({ name: "id3" }),
      makeTestAxis({ name: "id4" }),
      makeTestAxis({ name: "id5" }),
    ]);
    const linkerMap = LinkerMap.fromColumns([
      makeLinkerColumn({ name: "c12", from: [axis1], to: [axis2] }),
      makeLinkerColumn({ name: "c13", from: [axis1], to: [axis3] }),
      makeLinkerColumn({ name: "c45", from: [axis4], to: [axis5] }),
    ]);

    let testCase = (params: {
      from: AxisSpecNormalized[];
      to: AxisSpecNormalized[];
      expected: string[];
    }) => {
      const linkers = linkerMap.getLinkerColumnsForAxes({
        from: params.from,
        to: params.to,
        throwWhenNoLinkExists: false,
      });
      expect(linkers.map((item) => item.spec.name).sort()).toEqual(params.expected);
    };

    testCase({ from: [axis2], to: [axis3], expected: [] });
    testCase({ from: [axis2], to: [axis1], expected: ["c12"] });
    testCase({ from: [axis1], to: [axis4], expected: [] });
  });

  test("Search in linker columns map with parents", () => {
    const axisC = makeTestAxis({ name: "c" });
    const axisB = makeTestAxis({ name: "b" });
    const axisA = makeTestAxis({ name: "a", parents: [axisB] });

    const linkerMap = LinkerMap.fromColumns([
      makeLinkerColumn({ name: "abc", from: [axisA, axisB], to: [axisC] }),
    ]);

    let testCase = (params: {
      from: AxisSpecNormalized[];
      to: AxisSpecNormalized[];
      expected: string[];
    }) => {
      const linkers = linkerMap.getLinkerColumnsForAxes({
        from: params.from,
        to: params.to,
        throwWhenNoLinkExists: false,
      });
      expect(linkers.map((item) => item.spec.name).sort()).toEqual(params.expected);
    };

    testCase({
      from: getNormalizedAxesList([axisC]),
      to: getNormalizedAxesList([axisA, axisB]),
      expected: ["abc"],
    });
  });

  test("Axis tree - without parents", () => {
    const [axisA, axisB] = getNormalizedAxesList([
      makeTestAxis({ name: "a" }),
      makeTestAxis({ name: "b" }),
    ]);
    const tree = getAxesTree(axisA);
    expect(getSetFromAxisTree(tree).size).toBe(1);
    expect(getArrayFromAxisTree(tree).length).toBe(1);

    expect(LinkerMap.getAxesGroups([axisA, axisB]).length).toBe(2);
  });

  test("Axis tree - with parents", () => {
    const axisD = makeTestAxis({ name: "d" });
    const axisC = makeTestAxis({ name: "c", parents: [axisD] });
    const axisB = makeTestAxis({ name: "b", parents: [axisC] });
    const axisA = makeTestAxis({ name: "a", parents: [axisB] });
    const [axisDn, axisCn, axisBn, axisAn] = getNormalizedAxesList([axisD, axisC, axisB, axisA]);

    const tree = getAxesTree(axisAn);
    expect(getSetFromAxisTree(tree).size).toBe(4);
    expect(getArrayFromAxisTree(tree).length).toBe(4);

    for (const group of allPermutations([axisAn, axisBn, axisCn, axisDn])) {
      expect(LinkerMap.getAxesGroups(group).length).toBe(1);
    }

    const axisD2 = makeTestAxis({ name: "d" });
    const axisC2 = makeTestAxis({ name: "c", parents: [axisD2] });
    const axisB2 = makeTestAxis({ name: "b" });
    const axisA2 = makeTestAxis({ name: "a", parents: [axisB2] });
    const normalized2 = getNormalizedAxesList([axisD2, axisC2, axisB2, axisA2]);

    for (const group of allPermutations(normalized2)) {
      expect(LinkerMap.getAxesGroups(group).length).toBe(2);
    }

    const axisD3 = makeTestAxis({ name: "d" });
    const axisC3 = makeTestAxis({ name: "c" });
    const axisB3 = makeTestAxis({ name: "b" });
    const axisA3 = makeTestAxis({ name: "a", parents: [axisB3] });
    const normalized3 = getNormalizedAxesList([axisD3, axisC3, axisB3, axisA3]);

    for (const group of allPermutations(normalized3)) {
      expect(LinkerMap.getAxesGroups(group).length).toBe(3);
    }

    const axisD4 = makeTestAxis({ name: "d" });
    const axisC4 = makeTestAxis({ name: "c" });
    const axisB4 = makeTestAxis({ name: "b" });
    const axisA4 = makeTestAxis({ name: "a" });
    const normalized4 = getNormalizedAxesList([axisD4, axisC4, axisB4, axisA4]);

    for (const group of allPermutations(normalized4)) {
      expect(LinkerMap.getAxesGroups(group).length).toBe(4);
    }
  });

  test("Generate partial trees", () => {
    // Axes graph of parents (A, E - roots, C, B, D - parents) in some column:
    // A - C
    //  \_ B _ D
    // E/
    //
    // If the column is not a linker: trees to search linkers should be:
    // 1 C
    // 2 D
    // 3 B - D
    // 4 A - C
    //    \_ B - D
    // 5 E - B - D

    // If the axes are in a linker: trees must be in the linkers map:

    // 1 A - C
    //    \_ B _ D
    // 2 E - B - D

    const axisD = makeTestAxis({ name: "d" });
    const axisC = makeTestAxis({ name: "c" });
    const axisB = makeTestAxis({ name: "b", parents: [axisD] });
    const axisA = makeTestAxis({ name: "a", parents: [axisB, axisC] });
    const axisE = makeTestAxis({ name: "e", parents: [axisB, axisC] });
    const axisF = makeTestAxis({ name: "f" });
    const axisH = makeTestAxis({ name: "h" });

    const group1 = [axisA, axisB, axisC, axisD, axisE];
    const group2 = [axisF];
    const group3 = [axisH];
    const group1Normalized = getNormalizedAxesList(group1);
    const group2Normalized = getNormalizedAxesList(group2);
    const [axisAn, axisBn, , axisDn, axisEn] = group1Normalized;

    const linker1 = makeLinkerColumn({ name: "linker1", from: group1, to: group2 });
    const linker2 = makeLinkerColumn({ name: "linker2", from: group2, to: group3 });

    const roots = LinkerMap.getAxesRoots(group1Normalized);

    expect(roots).toEqual([axisAn, axisEn]);

    const groups = LinkerMap.getAxesGroups([...group1Normalized, ...group2Normalized]);
    expect(groups.length).toBe(2);
    expect(groups[0]).toEqual(group1Normalized);
    expect(groups[1]).toEqual(group2Normalized);

    const linkersMap = LinkerMap.fromColumns([linker1, linker2]);

    // Reversed edges: from group2 we reach group1 (no forward edge to group3)
    expect(
      new Set(
        linkersMap.getReachableByLinkersAxesFromAxesNormalized(group2Normalized).map((a) => a.name),
      ),
    ).toEqual(new Set(group1.map((a) => a.name)));
    // Non-root axes (axisDn, axisBn) don't match linker map keys, so no reachability
    expect(linkersMap.getReachableByLinkersAxesFromAxesNormalized([axisDn])).toEqual([]);
    expect(linkersMap.getReachableByLinkersAxesFromAxesNormalized([axisBn])).toEqual([]);
  });

  test("Order of parents should not matter", () => {
    const axisA = makeTestAxis({ name: "a" });
    const axisB = makeTestAxis({ name: "b" });
    const axisC1 = makeTestAxis({ name: "c", parents: [axisA, axisB] });
    const axisC2 = makeTestAxis({ name: "c", parents: [axisB, axisA] });
    const axisD = makeTestAxis({ name: "d" });

    const [, , c1, c2, dn] = getNormalizedAxesList([axisA, axisB, axisC1, axisC2, axisD]);
    const linkerMap = LinkerMap.fromColumns([
      makeLinkerColumn({ name: "linker1", from: [axisA, axisB, axisC1], to: [axisD] }),
    ]);

    expect(
      linkerMap.getLinkerColumnsForAxes({ from: [dn], to: [c2], throwWhenNoLinkExists: false }),
    ).not.toHaveLength(0);
    expect(
      linkerMap.getLinkerColumnsForAxes({ from: [dn], to: [c1], throwWhenNoLinkExists: false }),
    ).not.toHaveLength(0);
  });

  test("Non-linkable axes", () => {
    const axisA = makeTestAxis({ name: "a" });
    const axisB = makeTestAxis({ name: "b" });
    const axisC = makeTestAxis({ name: "c", parents: [axisA, axisB] });
    const axisD = makeTestAxis({ name: "d" });
    const axisE = makeTestAxis({ name: "e" });

    const linkerMap = LinkerMap.fromColumns([
      makeLinkerColumn({ name: "linker1", from: [axisA, axisB, axisC], to: [axisD] }),
    ]);

    expect(
      linkerMap
        .getNonLinkableAxes(
          getNormalizedAxesList([axisA, axisB, axisC, axisD]),
          getNormalizedAxesList([axisA, axisB, axisC, axisE]),
        )
        .map((v) => v.name),
    ).toEqual(["a", "b", "e"]);

    expect(
      linkerMap
        .getNonLinkableAxes([], getNormalizedAxesList([axisA, axisB, axisC, axisE]))
        .map((v) => v.name),
    ).toEqual(["a", "b", "c", "e"]);
  });

  test("getReachableByLinkersAxesFromAxes", () => {
    const axisA = makeTestAxis({ name: "a" });
    const axisB = makeTestAxis({ name: "b" });
    const axisC = makeTestAxis({ name: "c" });
    const axisD = makeTestAxis({ name: "d" });
    const linkerMap = LinkerMap.fromColumns([
      makeLinkerColumn({ name: "linker1", from: [axisA], to: [axisB] }),
      makeLinkerColumn({ name: "linker2", from: [axisB], to: [axisC] }),
      makeLinkerColumn({ name: "linker3", from: [axisC], to: [axisD] }),
    ]);

    expect(linkerMap.getReachableByLinkersAxesFromAxes([axisD])).toEqual(
      getNormalizedAxesList([axisC, axisB, axisA]),
    );
    expect(linkerMap.getReachableByLinkersAxesFromAxes([axisA])).toEqual([]);
  });
});

/**
 * MILAB-6651 — side assignment for the real `pl7.app/sc/cellLinker`.
 *
 * In the data, many cells map to ONE clonotype, so the clonotype is the linker's
 * one-side and the sample/cell pair is its many-side. `mixcr-clonotyping` authors
 * the axes as `[sampleId, cellId <- sampleId, scClonotypeKey]`, and side assignment
 * is purely positional — `getAxesGroups` returns groups ordered by their smallest
 * contained index and `fromColumns` destructures `const [left, right] = groups`
 * (`linker_columns.ts:53`). So the engine reads the sides backwards.
 *
 * These are characterization tests: they assert the WRONG behaviour that exists
 * today. When explicit sides land, they must flip — and that flip is the proof.
 */
describe("MILAB-6651 cellLinker side assignment", () => {
  const axisSampleId = makeTestAxis({ name: "sampleId" });
  const axisCellId = makeTestAxis({ name: "cellId", parents: [axisSampleId] });
  const axisClonotype = makeTestAxis({ name: "scClonotypeKey" });

  /** `[sampleId, cellId <- sampleId, scClonotypeKey]` — the layout as authored. */
  const asAuthored = makeLinkerColumn({
    name: "cellLinker",
    from: [axisSampleId, axisCellId],
    to: [axisClonotype],
  });

  /** The same linker with the clonotype component authored first. */
  const corrected = makeLinkerColumn({
    name: "cellLinker",
    from: [axisClonotype],
    to: [axisSampleId, axisCellId],
  });

  /**
   * Group membership as a sorted set. `getAxesGroups` documents "There are no order
   * inside every group" (`linker_columns.ts:271`), so asserting a particular order
   * *within* a group would pin an implementation detail the source explicitly
   * disclaims. Which group comes *first* is what side assignment reads, and that is
   * asserted positionally.
   */
  const names = (axes: AxisSpecNormalized[]) => axes.map((a) => a.name).sort();

  test("grouping order puts the sample/cell component first, so it becomes the one-side", () => {
    const groups = LinkerMap.getAxesGroups(
      getNormalizedAxesList([axisSampleId, axisCellId, axisClonotype]),
    );

    expect(groups.length).toBe(2);
    // groups[0] is destructured as `left` — the one-side. That is inverted:
    // {sampleId, cellId} is the many-side in reality.
    expect(names(groups[0])).toEqual(["cellId", "sampleId"]);
    expect(names(groups[1])).toEqual(["scClonotypeKey"]);
  });

  test("a clonotype-keyed source reaches cell-level axes today (the leakage)", () => {
    const linkerMap = LinkerMap.fromColumns([asAuthored]);

    // Edges are stored many-side -> one-side (`linker_columns.ts:91`), so with the
    // sides inverted a clonotype-keyed table can traverse down to per-cell axes.
    // This is what puts cell-level columns into a clonotype-keyed p-frame.
    expect(
      new Set(linkerMap.getReachableByLinkersAxesFromAxes([axisClonotype]).map((a) => a.name)),
    ).toEqual(new Set(["cellId", "sampleId"]));
  });

  test("a cell-keyed source cannot reach the clonotype today (the lost capability)", () => {
    // The trunk must carry the whole parent tree. Linker map keys are built from
    // `getArrayFromAxisTree`, so the cell trunk's key is [cellId, sampleId]; passing
    // cellId alone yields the key [cellId] and misses for an unrelated reason.
    const cellTrunk = [axisSampleId, axisCellId];

    const asAuthoredMap = LinkerMap.fromColumns([asAuthored]);
    expect(asAuthoredMap.getReachableByLinkersAxesFromAxes(cellTrunk)).toEqual([]);

    // Authoring the same linker with correct sides makes the intended cell ->
    // clonotype enrichment appear, and removes the reverse traversal.
    const correctedMap = LinkerMap.fromColumns([corrected]);
    expect(correctedMap.getReachableByLinkersAxesFromAxes(cellTrunk).map((a) => a.name)).toEqual([
      "scClonotypeKey",
    ]);
    expect(correctedMap.getReachableByLinkersAxesFromAxes([axisClonotype])).toEqual([]);
  });

  /**
   * Exhaustive companion to the ordering test above, and the TS mirror of
   * `split_component_order_follows_authoring_order_for_every_permutation` in
   * pframes-rs `axes_spec.rs`.
   *
   * Group *membership* must not depend on authoring order; which group comes *first*
   * must. That distinction is the whole of MILAB-6651 — the cellLinker's axes group
   * correctly however they are written down, and it is purely their position that
   * decides which component gets treated as the one-side. So no structural rule can
   * recover the intended direction; it has to be declared or read from data.
   *
   * Note the two engines reach this ordering independently: Rust via
   * `disjoint::DisjointSet::sets()`, TS via its own index scan (`linker_columns.ts:304,330`).
   * Nothing couples them, and they have already drifted twice (malformed-linker
   * handling, `excludeColumns` support), so both sides assert it separately. A real
   * shared fixture would need a generated cross-repo contract.
   */
  test("grouping is authoring-order independent, but group position is not", () => {
    const normalized = getNormalizedAxesList([axisSampleId, axisCellId, axisClonotype]);

    for (const order of allPermutations(normalized)) {
      const groups = LinkerMap.getAxesGroups(order);
      expect(groups.length).toBe(2);

      // Membership is invariant across all 6 orderings.
      expect(groups.map(names).sort((a, b) => a[0].localeCompare(b[0]))).toEqual([
        ["cellId", "sampleId"],
        ["scClonotypeKey"],
      ]);

      // Position tracks the earliest-written member of each group — which is exactly
      // why a mis-authored linker inverts its own sides.
      const earliest = (group: AxisSpecNormalized[]) =>
        Math.min(...group.map((a) => order.findIndex((o) => o.name === a.name)));
      expect(earliest(groups[0])).toBeLessThan(earliest(groups[1]));
    }
  });
});
