import {
  canonicalizeJson,
  parseJson,
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
  children: AxisTree[]; // parents
};

function makeAxisTree(axis: AxisSpec): AxisTree {
  return { axis, children: [] };
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
  const set = new Set([canonicalizeJson(tree.axis)]);
  let nodesQ = [tree];
  while (nodesQ.length) {
    const nextNodes = [];
    for (const node of nodesQ) {
      for (const parent of node.children) {
        set.add(canonicalizeJson(parent.axis));
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
      for (const parent of node.children /* TODO: sort node.children somehow */) {
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

function canonicalizeFlattenedAxisTree(axis: AxisSpec): CanonicalizedJson<AxisSpec[]> {
  return canonicalizeJson(arrayFromAxisTree(getAxesTree(axis)));
}

type AxesKey = CanonicalizedJson<AxisSpec[]>;
export type CompositeLinkerMap = Map< // TODO: make a class with methods
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
    const leftKeyVariants: AxesKey[] = getAxesRoots(left).map(canonicalizeFlattenedAxisTree);
    const rightKeyVariants: AxesKey[] = getAxesRoots(right).map(canonicalizeFlattenedAxisTree);

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
  const allAvailableKeys = new Set<AxesKey>();
  let nextKeys = sourceAxesKeys;
  while (nextKeys.length) {
    const next: AxesKey[] = [];
    for (const key of nextKeys) {
      const node = linkersMap.get(key);
      if (!node) continue;
      for (const availableKey of node.keys()) {
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
export function searchLinkerPath(
  linkerColumnsMap: CompositeLinkerMap,
  startKey: AxesKey,
  endKey: AxesKey,
): PColumnIdAndSpec[] {
  const previous: Record<AxesKey, AxesKey> = {};
  let nextIds = new Set([startKey]);
  const visited = new Set([startKey]);
  while (nextIds.size) {
    const next = new Set<AxesKey>();
    for (const nextId of nextIds) {
      const node = linkerColumnsMap.get(nextId);
      if (!node) continue;
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
  const startKeys = sourceAxes.map(canonicalizeFlattenedAxisTree);
  // target keys contain all axes to be linked; if some of target axes has parents they must be in the key
  return Array.from(
    new Map(
      getAxesRoots(targetAxes)
        .map(canonicalizeFlattenedAxisTree)
        .flatMap((targetKey) => {
          const linkers = startKeys
            .map((startKey) => searchLinkerPath(linkerColumnsMap, startKey, targetKey))
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
export function getAxesListFromKeysList(keys: AxesKey[]): AxisSpec[] {
  return Array.from(
    new Map(
      keys.flatMap(parseJson)
        .map((axis) => [canonicalizeJson(axis), axis]),
    ).values(),
  );
}

/** Get axes of target axes that are impossible to be linked to source axes with current linker map */
export function getNonLinkableAxes(
  linkerColumnsMap: CompositeLinkerMap,
  sourceAxes: AxisSpec[],
  targetAxes: AxisSpec[],
): AxisSpec[] {
  // start keys - all possible keys in linker map using sourceAxes (for example, all axes of block's columns or all axes of columns in data-inputs)
  const startKeys = sourceAxes.map(canonicalizeFlattenedAxisTree);
  // target keys contain all axes to be linked; if some of target axes has parents they must be in the key
  const missedTargetKeys = getAxesRoots(targetAxes)
    .map(canonicalizeFlattenedAxisTree)
    .filter((targetKey) =>
      !startKeys.some((startKey) => searchLinkerPath(linkerColumnsMap, startKey, targetKey).length),
    );
  return getAxesListFromKeysList(missedTargetKeys);
}

/** Get all axes that are not parents of any other axis */
export function getAxesRoots(axes: AxisSpec[]): AxisSpec[] {
  const parentsSet = new Set(axes.flatMap(getAxisParents).map(canonicalizeJson));
  return axes.filter((axis) => !parentsSet.has(canonicalizeJson(axis)));
}

/** Get all axes that can be connected to sourceAxes by linkers */
export function getReachableByLinkersAxesFromAxes(
  sourceAxes: AxisSpec[],
  linkersMap: CompositeLinkerMap,
): AxisSpec[] {
  const startKeys = sourceAxes.map(canonicalizeFlattenedAxisTree);
  const availableKeys = searchAvailableAxesKeys(startKeys, linkersMap);
  return getAxesListFromKeysList([...availableKeys]);
}
