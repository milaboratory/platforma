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
} from './spec/spec';

/** Tree: axis is a root, its parents are children */
type AxisTree = {
  axis: AxisSpecNormalized;
  children: AxisTree[]; // parents
};

function makeAxisTree(axis: AxisSpecNormalized): AxisTree {
  return { axis, children: [] };
}

function normalizingAxesComparator(axis1: AxisSpec, axis2: AxisSpec): 1 | -1 | 0 {
  if (axis1.name !== axis2.name) {
    return axis1.name < axis2.name ? 1 : -1;
  }
  if (axis1.type !== axis2.type) {
    return axis1.type < axis2.type ? 1 : -1;
  }
  const domain1 = canonicalizeJson(axis1.domain ?? {});
  const domain2 = canonicalizeJson(axis2.domain ?? {});
  if (domain1 !== domain2) {
    return domain1 < domain2 ? 1 : -1;
  }
  const annotations1 = canonicalizeJson(axis1.annotations ?? {});
  const annotations2 = canonicalizeJson(axis2.annotations ?? {});
  if (annotations1 !== annotations2) {
    return annotations1 < annotations2 ? 1 : -1;
  }
  return 0;
}

function parseParentsFromAnnotations(axis: AxisSpec) {
  const parentsList = readAnnotationJson(axis, Annotation.Parents);
  if (parentsList === undefined) {
    return [];
  }
  parentsList.sort(normalizingAxesComparator);
  return parentsList;
}

export function getNormalizedAxesList(axes: AxisSpec[]): AxisSpecNormalized[] {
  if (!axes.length) {
    return [];
  }
  const modifiedAxes: AxisSpecNormalized[] = axes.map((axis) => {
    const { parentAxes, ...copiedRest } = axis;
    return { ...copiedRest, parentAxesSpec: [] };
  });

  axes.forEach((axis, idx) => {
    if (axis.parentAxes) { // if we have parents by indexes then take from the list
      modifiedAxes[idx].parentAxesSpec = axis.parentAxes.map((idx) => modifiedAxes[idx]);
    } else { // else try to parse from annotation and normalize recursively
      modifiedAxes[idx].parentAxesSpec = getNormalizedAxesList(parseParentsFromAnnotations(axis));
    }
  });
  return modifiedAxes;
}

export function getDenormalizedAxesList(axesSpec: AxisSpecNormalized[]): AxisSpec[] {
  const idsList = axesSpec.map((axisSpec) => canonicalizeJson(getAxisId(axisSpec)));
  return axesSpec.map((axisSpec) => {
    const parentsIds = axisSpec.parentAxesSpec.map((axisSpec) => canonicalizeJson(getAxisId(axisSpec)));
    const parentIdxs = parentsIds.map((id) => idsList.indexOf(id));
    const { parentAxesSpec, ...copiedRest } = axisSpec;
    if (parentIdxs.length) {
      return { ...copiedRest, parentAxes: parentIdxs } as AxisSpec;
    }
    return copiedRest;
  });
}

/** Build tree by axis parents annotations */
export function getAxesTree(rootAxis: AxisSpecNormalized): AxisTree {
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
export function setFromAxisTree(tree: AxisTree): Set<CanonicalizedJson<AxisId>> {
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
export function getArrayFromAxisTree(tree: AxisTree): AxisSpecNormalized[] {
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
export function getAxesGroups(axesSpec: AxisSpecNormalized[]): AxisSpecNormalized[][] {
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

type LinkerKey = CanonicalizedJson<AxisId[]>;
function getLinkerKeyFromAxisSpec(axis: AxisSpecNormalized): LinkerKey {
  return canonicalizeJson(getArrayFromAxisTree(getAxesTree(axis)).map(getAxisId));
}
export type CompositeLinkerMap = Map<
  LinkerKey,
  {
    spec: AxisSpecNormalized[]; // axis specs - source for the key
    linkWith: Map<LinkerKey, PColumnIdAndSpec>; // for every axis (possibly in group with parents - available by linkers another axes and corresponding linkers)
  }
>;

/** Creates graph (CompositeLinkerMap) of linkers connected by axes (single or grouped by parents) */
export function getCompositeLinkerMap(compositeLinkers: PColumnIdAndSpec[]): CompositeLinkerMap {
  const result: CompositeLinkerMap = new Map();
  for (const linker of compositeLinkers.filter((l) => !!readAnnotationJson(l.spec, Annotation.IsLinkerColumn))) {
    const groups = getAxesGroups(getNormalizedAxesList(linker.spec.axesSpec)); // split input axes into groups by parent links from annotation

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
    const leftKeyVariants: [LinkerKey, AxisSpecNormalized[]][] = getAxesRoots(left).map((axis) => {
      const axes = getArrayFromAxisTree(getAxesTree(axis));
      const key = canonicalizeJson(axes.map(getAxisId));
      return [key, axes];
    });
    const rightKeyVariants: [LinkerKey, AxisSpecNormalized[]][] = getAxesRoots(right).map((axis) => {
      const axes = getArrayFromAxisTree(getAxesTree(axis));
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
  return result;
}

/** Get all available nodes of linkers graphs if start from sourceAxesKeys */
export function searchAvailableAxesKeys(
  sourceAxesKeys: LinkerKey[],
  linkersMap: CompositeLinkerMap,
): Set<LinkerKey> {
  const startKeys = new Set(sourceAxesKeys);
  const allAvailableKeys = new Set<LinkerKey>();
  let nextKeys = sourceAxesKeys;
  while (nextKeys.length) {
    const next: LinkerKey[] = [];
    for (const key of nextKeys) {
      const node = linkersMap.get(key);
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
export function searchLinkerPath(
  linkerColumnsMap: CompositeLinkerMap,
  startKey: LinkerKey,
  endKey: LinkerKey,
): PColumnIdAndSpec[] {
  const previous: Record<LinkerKey, LinkerKey> = {};
  let nextIds = new Set([startKey]);
  const visited = new Set([startKey]);
  while (nextIds.size) {
    const next = new Set<LinkerKey>();
    for (const nextId of nextIds) {
      const node = linkerColumnsMap.get(nextId);
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
          return ids.map((id: LinkerKey) => linkerColumnsMap.get(id)!.linkWith.get(previous[id])!);
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
  from: AxisSpecNormalized[];
  to: AxisSpecNormalized[];
  throwWhenNoLinkExists?: boolean;
}): PColumnIdAndSpec[] {
  // start keys - all possible keys in linker map using sourceAxes (for example, all axes of block's columns or all axes of columns in data-inputs)
  const startKeys: LinkerKey[] = sourceAxes.map(getLinkerKeyFromAxisSpec);

  return Array.from(
    new Map(
      getAxesRoots(targetAxes)
        .map(getLinkerKeyFromAxisSpec) // target keys contain all axes to be linked; if some of target axes has parents they must be in the key
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
export function getAxesListFromKeysList(keys: LinkerKey[], linkerMap: CompositeLinkerMap): AxisSpecNormalized[] {
  return Array.from(
    new Map(
      keys.flatMap((key) => linkerMap.get(key)?.spec ?? [])
        .map((axis) => [canonicalizeJson(getAxisId(axis)), axis]),
    ).values(),
  );
}

/** Get axes of target axes that are impossible to be linked to source axes with current linker map */
export function getNonLinkableAxes(
  linkerColumnsMap: CompositeLinkerMap,
  sourceAxes: AxisSpecNormalized[],
  targetAxes: AxisSpecNormalized[],
): AxisSpecNormalized[] {
  const startKeys = sourceAxes.map(getLinkerKeyFromAxisSpec);
  // target keys contain all axes to be linked; if some of target axes has parents they must be in the key
  const missedTargetKeys = getAxesRoots(targetAxes)
    .map(getLinkerKeyFromAxisSpec)
    .filter((targetKey) =>
      !startKeys.some((startKey) => searchLinkerPath(linkerColumnsMap, startKey, targetKey).length),
    );
  return getAxesListFromKeysList(missedTargetKeys, linkerColumnsMap);
}

/** Get all axes that are not parents of any other axis */
// export function getAxesRoots(axes: AxisSpecNormalized[]): AxisSpecNormalized[] {
//   const parentsSet = new Set();
//   for (const axis of axes) {
//     const parents = axis.parentAxesSpec.map((spec) => canonicalizeJson(getAxisId(spec)));
//     for (const parent of parents) {
//       parentsSet.add(parent);
//     }
//   }
//   const keys = axes.map((spec) => canonicalizeJson(getAxisId(spec)));
//   const result: AxisSpecNormalized[] = [];

//   keys.forEach((key, idx) => {
//     if (!parentsSet.has(key)) {
//       result.push(axes[idx]);
//     }
//   });
//   return result;
// }

export function getAxesRoots(axes: AxisSpecNormalized[]): AxisSpecNormalized[] {
  const parentsSet = new Set(axes.flatMap((axis) => axis.parentAxesSpec).map((spec) => canonicalizeJson(getAxisId(spec))));
  return axes.filter((axis) => !parentsSet.has(canonicalizeJson(getAxisId(axis))));
}

/** Get all axes that can be connected to sourceAxes by linkers */
export function getReachableByLinkersAxesFromAxes(
  sourceAxes: AxisSpecNormalized[],
  linkersMap: CompositeLinkerMap,
): AxisSpec[] {
  const startKeys = sourceAxes.map(getLinkerKeyFromAxisSpec);
  const availableKeys = searchAvailableAxesKeys(startKeys, linkersMap);
  return getAxesListFromKeysList([...availableKeys], linkersMap);
}
