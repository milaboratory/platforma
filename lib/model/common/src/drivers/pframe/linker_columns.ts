import {
  canonicalizeJson,
  type CanonicalizedJson,
} from '../../json';
import {
  Annotation,
  type AxisSpec,
  type AxesSpec,
  type PColumnIdAndSpec,
  readAnnotationJson,
} from './spec/spec';

/** Tree: axis is a root, its parents are children */
type AxisTree = {
  axis: AxisSpec;
  id: CanonicalizedJson<AxisSpec>;
  children: AxisTree[]; // parents
};

function makeAxisTree(axis: AxisSpec): AxisTree {
  return { axis, id: canonicalizeJson(axis), children: [] };
}

/** Get axes parents list from annotation if exist */
function getAxisParents(axis: AxisSpec): AxisSpec[] {
  return readAnnotationJson(axis, Annotation.Parents) ?? [];
}

/** Build tree by axis parents annotations */
export function getAxesTree(rootAxis: AxisSpec): AxisTree {
  const root = makeAxisTree(rootAxis);
  let nodesQ = [root];
  while (nodesQ.length) {
    const nextNodes: AxisTree[] = [];
    for (const node of nodesQ) {
      node.children = getAxisParents(node.axis).map(makeAxisTree);
      nextNodes.push(...node.children);
    }
    nodesQ = nextNodes;
  }
  return root;
}

/** Get set of canonicalized axisSpecs from axisTree */
export function setFromAxisTree(tree: AxisTree): Set<CanonicalizedJson<AxisSpec>> {
  const set = new Set([tree.id]);
  let nodesQ = [tree];
  while (nodesQ.length) {
    const nextNodes = [];
    for (const node of nodesQ) {
      for (const parent of node.children) {
        set.add(parent.id);
        nextNodes.push(parent);
      }
    }
    nodesQ = nextNodes;
  }
  return set;
}

/** Get array of axisSpecs from axisTree */
export function arrayFromAxisTree(tree: AxisTree): AxisSpec[] {
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
export function getAxesGroups(axesSpec: AxesSpec): AxisSpec[][] {
  switch (axesSpec.length) {
    case 0: return [];
    case 1: return [[axesSpec[0]]];
    default: break;
  }

  const axisKeys = axesSpec.map(canonicalizeJson);
  const axisParentsIdxs = axesSpec.map(
    (spec) => new Set(
      getAxisParents(spec)
        .map(canonicalizeJson)
        .map((el) => {
          const idx = axisKeys.indexOf(el);
          if (idx === -1) {
            throw new Error(`malformed axesSpec: ${JSON.stringify(axesSpec)}, unable to locate parent ${el}`);
          }
          return idx;
        }),
    ),
  );

  const allIdxs = axesSpec.map((_spec, idx) => idx);
  const groups: number[][] = []; // groups of axis indexes

  let currentGroup = [0];
  let nextElsOfCurrentGroup = [0];
  const usedIdxs = new Set([0]);

  while (currentGroup.length) {
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
    const nextFreeEl = allIdxs.find((idx) => !usedIdxs.has(idx));
    if (nextFreeEl !== undefined) {
      currentGroup = [nextFreeEl];
      nextElsOfCurrentGroup = [nextFreeEl];
      usedIdxs.add(nextFreeEl);
    } else {
      currentGroup = [];
      nextElsOfCurrentGroup = [];
    }
  }

  return groups.map((group) => group.map((idx) => axesSpec[idx]));
}

type AxesKey = CanonicalizedJson<AxisSpec[]>;
export type CompositeLinkerMap = Map<
  AxesKey,
  Map<AxesKey, PColumnIdAndSpec> // for every axis (possibly in group with parents - available by linkers another axes and corresponding linkers)
>;

/** Creates graph (CompositeLinkerMap) of linkers connected by axes (single or grouped by parents) */
export function getCompositeLinkerMap(compositeLinkers: PColumnIdAndSpec[]): CompositeLinkerMap {
  const result: CompositeLinkerMap = new Map();
  for (const linker of compositeLinkers.filter((l) => !!readAnnotationJson(l.spec, Annotation.IsLinkerColumn))) {
    const groups = getAxesGroups(linker.spec.axesSpec); // split input axes into groups by parent links from annotation

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
    const leftKeyVariants: AxesKey[] = getAxesRoots(left).map((axis) => canonicalizeJson(arrayFromAxisTree(getAxesTree(axis))));
    const rightKeyVariants: AxesKey[] = getAxesRoots(right).map((axis) => canonicalizeJson(arrayFromAxisTree(getAxesTree(axis))));

    for (const keyLeft of leftKeyVariants) {
      if (!result.has(keyLeft)) {
        result.set(keyLeft, new Map());
      }
    }
    for (const keyRight of rightKeyVariants) {
      if (!result.has(keyRight)) {
        result.set(keyRight, new Map());
      }
    }
    for (const keyLeft of leftKeyVariants) {
      for (const keyRight of rightKeyVariants) {
        result.get(keyLeft)?.set(keyRight, linker);
        result.get(keyRight)?.set(keyLeft, linker);
      }
    }
  }
  return result;
}

/** Get all available nodes of linkers graphs if start from sourceAxesKeys */
export function searchAvailableAxesKeys(
  sourceAxesKeys: AxesKey[],
  linkersMap: CompositeLinkerMap,
): Set<AxesKey> {
  const startKeys = new Set(sourceAxesKeys);
  const allAvailableKeys: Set<AxesKey> = new Set();
  let nextKeys = sourceAxesKeys;
  while (nextKeys.length) {
    const next: AxesKey[] = [];
    for (const key of nextKeys) {
      const node = linkersMap.get(key);
      if (node) {
        for (const availableKey of node.keys()) {
          if (!allAvailableKeys.has(availableKey) && !startKeys.has(availableKey)) {
            next.push(availableKey);
            allAvailableKeys.add(availableKey);
          }
        }
      }
    }
    nextKeys = next;
  }
  return allAvailableKeys;
}

/** Get all linker columns that are necessary to reach endKey from startKey */
export function searchLinkerPath(
  linkerColumnsMap: CompositeLinkerMap,
  startKey: AxesKey,
  endKey: AxesKey,
): PColumnIdAndSpec[] {
  const previous: Record<AxesKey, AxesKey> = {};
  const visited: Set<AxesKey> = new Set([startKey]);
  let nextIds: Set<AxesKey> = new Set([startKey]);
  while (nextIds.size) {
    const next: Set<AxesKey> = new Set();
    for (const nextId of nextIds) {
      const node = linkerColumnsMap.get(nextId);
      if (node) {
        for (const availableId of node.keys()) {
          previous[availableId] = nextId;
          if (availableId === endKey) {
            const ids: AxesKey[] = [];
            let current = endKey;
            while (previous[current] !== startKey) {
              ids.push(current);
              current = previous[current];
            }
            ids.push(current);
            return ids.map((id: AxesKey) => linkerColumnsMap.get(id)!.get(previous[id])!);
          } else if (!visited.has(availableId)) {
            next.add(availableId);
            visited.add(availableId);
          }
        }
      }
    }
    nextIds = next;
  }
  return [];
}

export function getLinkerColumnsForAxes({
  linkerMap: linkerColumnsMap,
  from: sourceAxes,
  to: targetAxes,
  throwWhenNoLinkExists = true,
}: {
  linkerMap: CompositeLinkerMap;
  from: AxisSpec[];
  to: AxisSpec[];
  throwWhenNoLinkExists?: boolean;
}): PColumnIdAndSpec[] {
  // start keys - all possible keys in linker map using sourceAxes (for example, all axes of block's columns or all axes of columns in data-inputs)
  const startKeys: AxesKey[] = sourceAxes.map((axis) => canonicalizeJson(arrayFromAxisTree(getAxesTree(axis))));
  // target keys contain all axes to be linked; if some of target axes has parents they must be in the key
  const targetRoots: AxisSpec[] = getAxesRoots(targetAxes);
  const targetKeys: AxesKey[] = targetRoots.map((axis) => canonicalizeJson(arrayFromAxisTree(getAxesTree(axis))));

  const linkerColumnsIdSet = new Set();
  const linkerColumns: PColumnIdAndSpec[] = [];

  targetKeys.forEach((targetKey) => {
    let path: PColumnIdAndSpec[] = [];
    for (const startKey of startKeys) {
      const currentPath = searchLinkerPath(linkerColumnsMap, startKey, targetKey);
      if (path.length === 0 || (path.length > 0 && currentPath.length < path.length)) {
        path = currentPath;
      }
      if (path.length === 1) {
        break;
      }
    }
    if (!path.length && throwWhenNoLinkExists) {
      throw Error(`Unable to find linker column for ${targetKey}`);
    }
    for (const linker of path) {
      if (!linkerColumnsIdSet.has(linker.columnId)) {
        linkerColumnsIdSet.add(linker.columnId);
        linkerColumns.push(linker);
      }
    }
  });
  return linkerColumns;
}

/** Get list of axisSpecs from keys of linker columns map  */
export function getAxesListFromKeysList(keys: AxesKey[]): AxisSpec[] {
  const availableAxes: AxisSpec[] = [];
  const availableAxesKeySet: Set<CanonicalizedJson<AxisSpec>> = new Set();

  for (const key of keys) {
    const axes: AxisSpec[] = JSON.parse(key);
    for (const axis of axes) {
      const key = canonicalizeJson(axis);
      if (!availableAxesKeySet.has(key)) {
        availableAxesKeySet.add(key);
        availableAxes.push(axis);
      }
    }
  }

  return availableAxes;
}

/** Get axes of target axes that are impossible to be linked to source axes with current linker map */
export function getNonLinkableAxes(
  linkerColumnsMap: CompositeLinkerMap,
  sourceAxes: AxisSpec[],
  targetAxes: AxisSpec[],
): AxisSpec[] {
  // start keys - all possible keys in linker map using sourceAxes (for example, all axes of block's columns or all axes of columns in data-inputs)
  const startKeys: AxesKey[] = sourceAxes.map((axis) => canonicalizeJson(arrayFromAxisTree(getAxesTree(axis))));
  // target keys contain all axes to be linked; if some of target axes has parents they must be in the key
  const targetRoots: AxisSpec[] = getAxesRoots(targetAxes);
  const targetKeys: AxesKey[] = targetRoots.map((axis) => canonicalizeJson(arrayFromAxisTree(getAxesTree(axis))));

  const missedTargetKeys: AxesKey[] = [];
  targetKeys.forEach((targetKey) => {
    let path: PColumnIdAndSpec[] = [];
    for (const startKey of startKeys) {
      const currentPath = searchLinkerPath(linkerColumnsMap, startKey, targetKey);
      if (path.length === 0 || (path.length > 0 && currentPath.length < path.length)) {
        path = currentPath;
      }
      if (path.length) {
        break;
      }
    }
    if (!path.length) {
      missedTargetKeys.push(targetKey);
    }
  });
  return getAxesListFromKeysList(missedTargetKeys);
}

/** Get all axes that are not parents of any other axis */
export function getAxesRoots(axes: AxisSpec[]): AxisSpec[] {
  const parentsSet = new Set();
  for (const axis of axes) {
    const parents = getAxisParents(axis).map(canonicalizeJson);
    for (const parent of parents) {
      parentsSet.add(parent);
    }
  }
  const keys = axes.map(canonicalizeJson);
  const result: AxisSpec[] = [];

  keys.forEach((key, idx) => {
    if (!parentsSet.has(key)) {
      result.push(axes[idx]);
    }
  });
  return result;
}

/** Get all axes that can be connected to sourceAxes by linkers */
export function getReachableByLinkersAxesFromAxes(
  sourceAxes: AxisSpec[],
  linkersMap: CompositeLinkerMap,
): AxisSpec[] {
  const startKeys: AxesKey[] = sourceAxes.map((axis) => canonicalizeJson(arrayFromAxisTree(getAxesTree(axis))));
  const availableKeys = searchAvailableAxesKeys(startKeys, linkersMap);
  return getAxesListFromKeysList([...availableKeys]);
}
