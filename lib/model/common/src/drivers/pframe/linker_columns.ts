import {
  canonicalizeJson,
  type CanonicalizedJson,
} from '../../json';
import {
  Annotation,
  readAnnotationJson,
  type AxisSpec,
  type PColumnIdAndSpec,
  type AxisSpecNormalized,
  type AxisId,
  getAxisId,
  getNormalizedAxesList,
} from './spec/spec';

/** Tree: axis is a root, its parents are children */
type AxisTree = {
  axis: AxisSpecNormalized;
  children: AxisTree[]; // parents
};

function makeAxisTree(axis: AxisSpecNormalized): AxisTree {
  return { axis, children: [] };
}

type LinkerKey = CanonicalizedJson<AxisId[]>;
export type CompositeLinkerMap = Map<
  LinkerKey,
  {
    spec: AxisSpecNormalized[]; // axis specs - source for the key
    linkWith: Map<LinkerKey, PColumnIdAndSpec>; // for every axis (possibly in group with parents - available by linkers another axes and corresponding linkers)
  }
>;

interface LinkersData {
  data: CompositeLinkerMap;
}
export class LinkerMap implements LinkersData {
  /** Graph of linkers connected by axes (single or grouped by parents) */
  data: CompositeLinkerMap;

  constructor(linkerMap: CompositeLinkerMap) {
    this.data = linkerMap;
  }

  static fromColumns(columns: PColumnIdAndSpec[]) {
    const result: CompositeLinkerMap = new Map();
    for (const linker of columns.filter((l) => !!readAnnotationJson(l.spec, Annotation.IsLinkerColumn))) {
      const groups = LinkerMap.getAxesGroups(getNormalizedAxesList(linker.spec.axesSpec)); // split input axes into groups by parent links from annotation

      if (groups.length !== 2) {
        continue; // not a valid linker column
      }
      const [left, right] = groups;

      // In case of group:
      // A - C
      //  \_ B _ D
      // E/
      // put 2 variants as keys:
      // A - C
      //  \_ B _ D
      // and
      // E - B - D
      const leftKeyVariants: [LinkerKey, AxisSpecNormalized[]][] = LinkerMap.getAxesRoots(left).map((axis) => {
        const axes = LinkerMap.getArrayFromAxisTree(LinkerMap.getAxesTree(axis));
        const key = canonicalizeJson(axes.map(getAxisId));
        return [key, axes];
      });
      const rightKeyVariants: [LinkerKey, AxisSpecNormalized[]][] = LinkerMap.getAxesRoots(right).map((axis) => {
        const axes = LinkerMap.getArrayFromAxisTree(LinkerMap.getAxesTree(axis));
        const key = canonicalizeJson(axes.map(getAxisId));
        return [key, axes];
      });

      for (const [keyLeft, spec] of leftKeyVariants) {
        if (!result.has(keyLeft)) {
          result.set(keyLeft, { spec, linkWith: new Map() });
        }
      }
      for (const [keyRight, spec] of rightKeyVariants) {
        if (!result.has(keyRight)) {
          result.set(keyRight, { spec, linkWith: new Map() });
        }
      }
      for (const [keyLeft] of leftKeyVariants) {
        for (const [keyRight] of rightKeyVariants) {
          result.get(keyLeft)?.linkWith.set(keyRight, linker);
          result.get(keyRight)?.linkWith.set(keyLeft, linker);
        }
      }
    }
    return new this(result);
  }

  /** Get all available nodes of linker graphs if start from sourceAxesKeys */
  searchAvailableAxesKeys(sourceAxesKeys: LinkerKey[]): Set<LinkerKey> {
    const startKeys = new Set(sourceAxesKeys);
    const allAvailableKeys = new Set<LinkerKey>();
    let nextKeys = sourceAxesKeys;
    while (nextKeys.length) {
      const next: LinkerKey[] = [];
      for (const key of nextKeys) {
        const node = this.data.get(key);
        if (!node) continue;
        for (const availableKey of node.linkWith.keys()) {
          if (!allAvailableKeys.has(availableKey) && !startKeys.has(availableKey)) {
            next.push(availableKey);
            allAvailableKeys.add(availableKey);
          }
        }
      }
      nextKeys = next;
    }
    return allAvailableKeys;
  }

  /** Get all linker columns that are necessary to reach endKey from startKey */
  searchLinkerPath(startKey: LinkerKey, endKey: LinkerKey): PColumnIdAndSpec[] {
    const previous: Record<LinkerKey, LinkerKey> = {};
    let nextIds = new Set([startKey]);
    const visited = new Set([startKey]);
    while (nextIds.size) {
      const next = new Set<LinkerKey>();
      for (const nextId of nextIds) {
        const node = this.data.get(nextId);
        if (!node) continue;
        for (const availableId of node.linkWith.keys()) {
          previous[availableId] = nextId;
          if (availableId === endKey) {
            const ids: LinkerKey[] = [];
            let current = endKey;
            while (previous[current] !== startKey) {
              ids.push(current);
              current = previous[current];
            }
            ids.push(current);
            return ids.map((id: LinkerKey) => this.data.get(id)!.linkWith.get(previous[id])!);
          } else if (!visited.has(availableId)) {
            next.add(availableId);
            visited.add(availableId);
          }
        }
      }
      nextIds = next;
    }
    return [];
  }

  getLinkerColumnsForAxes({
    from: sourceAxes,
    to: targetAxes,
    throwWhenNoLinkExists = true,
  }: {
    from: AxisSpecNormalized[];
    to: AxisSpecNormalized[];
    throwWhenNoLinkExists?: boolean;
  }): PColumnIdAndSpec[] {
  // start keys - all possible keys in linker map using sourceAxes (for example, all axes of block's columns or all axes of columns in data-inputs)
    const startKeys: LinkerKey[] = sourceAxes.map(LinkerMap.getLinkerKeyFromAxisSpec);

    return Array.from(
      new Map(
        LinkerMap.getAxesRoots(targetAxes)
          .map(LinkerMap.getLinkerKeyFromAxisSpec) // target keys contain all axes to be linked; if some of target axes has parents they must be in the key
          .flatMap((targetKey) => {
            const linkers = startKeys
              .map((startKey) => this.searchLinkerPath(startKey, targetKey))
              .reduce((shortestPath, path) => shortestPath.length && shortestPath.length < path.length ? shortestPath : path,
                [] as PColumnIdAndSpec[])
              .map((linker) => [linker.columnId, linker] as const);
            if (!linkers.length && throwWhenNoLinkExists) {
              throw Error(`Unable to find linker column for ${targetKey}`);
            }
            return linkers;
          }),
      ).values(),
    );
  }

  /** Get list of axisSpecs from keys of linker columns map  */
  getAxesListFromKeysList(keys: LinkerKey[]): AxisSpecNormalized[] {
    return Array.from(
      new Map(
        keys.flatMap((key) => this.data.get(key)?.spec ?? [])
          .map((axis) => [canonicalizeJson(getAxisId(axis)), axis]),
      ).values(),
    );
  }

  /** Get axes of target axes that are impossible to be linked to source axes with current linker map */
  getNonLinkableAxes(
    sourceAxes: AxisSpecNormalized[],
    targetAxes: AxisSpecNormalized[],
  ): AxisSpecNormalized[] {
    const startKeys = sourceAxes.map(LinkerMap.getLinkerKeyFromAxisSpec);
    // target keys contain all axes to be linked; if some of target axes has parents they must be in the key
    const missedTargetKeys = LinkerMap.getAxesRoots(targetAxes)
      .map(LinkerMap.getLinkerKeyFromAxisSpec)
      .filter((targetKey) =>
        !startKeys.some((startKey) => this.searchLinkerPath(startKey, targetKey).length),
      );
    return this.getAxesListFromKeysList(missedTargetKeys);
  }

  /** Get all axes that can be connected to sourceAxes by linkers */
  getReachableByLinkersAxesFromAxes(
    sourceAxes: AxisSpecNormalized[]): AxisSpec[] {
    const startKeys = sourceAxes.map(LinkerMap.getLinkerKeyFromAxisSpec);
    const availableKeys = this.searchAvailableAxesKeys(startKeys);
    return this.getAxesListFromKeysList([...availableKeys]);
  }

  static getLinkerKeyFromAxisSpec(axis: AxisSpecNormalized): LinkerKey {
    return canonicalizeJson(LinkerMap.getArrayFromAxisTree(LinkerMap.getAxesTree(axis)).map(getAxisId));
  }

  /** Build tree by axis parents annotations */
  static getAxesTree(rootAxis: AxisSpecNormalized): AxisTree {
    const root = makeAxisTree(rootAxis);
    let nodesQ = [root];
    while (nodesQ.length) {
      const nextNodes: AxisTree[] = [];
      for (const node of nodesQ) {
        node.children = node.axis.parentAxesSpec.map(makeAxisTree);
        nextNodes.push(...node.children);
      }
      nodesQ = nextNodes;
    }
    return root;
  }

  /** Get set of canonicalized axisIds from axisTree */
  static getSetFromAxisTree(tree: AxisTree): Set<CanonicalizedJson<AxisId>> {
    const set = new Set([canonicalizeJson(getAxisId(tree.axis))]);
    let nodesQ = [tree];
    while (nodesQ.length) {
      const nextNodes = [];
      for (const node of nodesQ) {
        for (const parent of node.children) {
          set.add(canonicalizeJson(getAxisId(parent.axis)));
          nextNodes.push(parent);
        }
      }
      nodesQ = nextNodes;
    }
    return set;
  }

  /** Get array of axisSpecs from axisTree */
  static getArrayFromAxisTree(tree: AxisTree): AxisSpecNormalized[] {
    const res = [tree.axis];
    let nodesQ = [tree];
    while (nodesQ.length) {
      const nextNodes = [];
      for (const node of nodesQ) {
        for (const parent of node.children) {
          res.push(parent.axis);
          nextNodes.push(parent);
        }
      }
      nodesQ = nextNodes;
    }
    return res;
  }

  /**  Split array of axes into several arrays by parents: axes of one group are parents for each other.
     There are no order inside every group. */
  static getAxesGroups(axesSpec: AxisSpecNormalized[]): AxisSpecNormalized[][] {
    switch (axesSpec.length) {
      case 0: return [];
      case 1: return [[axesSpec[0]]];
      default: break;
    }

    const axisKeys = axesSpec.map((spec) => canonicalizeJson(getAxisId(spec)));
    const axisParentsIdxs = axesSpec.map(
      (spec) => new Set(
        spec.parentAxesSpec
          .map((spec) => canonicalizeJson(getAxisId(spec)))
          .map((el) => {
            const idx = axisKeys.indexOf(el);
            if (idx === -1) {
              throw new Error(`malformed axesSpec: ${JSON.stringify(axesSpec)}, unable to locate parent ${el}`);
            }
            return idx;
          }),
      ),
    );

    const allIdxs = [...axesSpec.keys()];
    const groups: number[][] = []; // groups of axis indexes

    const usedIdxs = new Set<number>();
    let nextFreeEl = allIdxs.find((idx) => !usedIdxs.has(idx));
    while (nextFreeEl !== undefined) {
      const currentGroup = [nextFreeEl];
      usedIdxs.add(nextFreeEl);

      let nextElsOfCurrentGroup = [nextFreeEl];
      while (nextElsOfCurrentGroup.length) {
        const next = new Set<number>();
        for (const groupIdx of nextElsOfCurrentGroup) {
          const groupElementParents = axisParentsIdxs[groupIdx];
          allIdxs.forEach((idx) => {
            if (idx === groupIdx || usedIdxs.has(idx)) {
              return;
            }
            const parents = axisParentsIdxs[idx];
            if (parents.has(groupIdx) || groupElementParents.has(idx)) {
              currentGroup.push(idx);
              next.add(idx);
              usedIdxs.add(idx);
            }
          });
        }
        nextElsOfCurrentGroup = [...next];
      }

      groups.push([...currentGroup]);
      nextFreeEl = allIdxs.find((idx) => !usedIdxs.has(idx));
    };

    return groups.map((group) => group.map((idx) => axesSpec[idx]));
  }

  /** Get all axes that are not parents of any other axis */
  static getAxesRoots(axes: AxisSpecNormalized[]): AxisSpecNormalized[] {
    const parentsSet = new Set(axes.flatMap((axis) => axis.parentAxesSpec).map((spec) => canonicalizeJson(getAxisId(spec))));
    return axes.filter((axis) => !parentsSet.has(canonicalizeJson(getAxisId(axis))));
  }
}
