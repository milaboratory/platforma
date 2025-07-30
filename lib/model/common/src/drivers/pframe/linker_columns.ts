import {
  canonicalizeJson,
  parseJson,
  type CanonicalizedJson,
} from '../../json';
import {
  Annotation,
  readAnnotation,
  type AxisSpec,
  type PColumnIdAndSpec,
  type AxisSpecNormalized,
  type AxisId,
  getAxisId,
} from './spec/spec';

/** Tree: axis is a root, its parents are children */
type AxisTree = {
  axis: AxisSpecNormalized;
  id: CanonicalizedJson<AxisId>;
  children: AxisTree[]; // parents
};

function makeAxisTree(axis: AxisSpecNormalized): AxisTree {
  return { axis, id: canonicalizeJson(getAxisId(axis)), children: [] };
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
  const parents = readAnnotation(axis, Annotation.Parents);
  if (parents === undefined) return [];
  let parentsList: AxisSpec[] = [];
  try {
    parentsList = parseJson(parents);
    parentsList.sort(normalizingAxesComparator);
  } catch {
    throw new Error(`malformed ${Annotation.Parents} annotation on axis ${JSON.stringify(axis)}: must be a valid JSON array`);
  }
  if (!Array.isArray(parentsList)) {
    throw new Error(`malformed ${Annotation.Parents} annotation on axis ${JSON.stringify(axis)}: must be an array`);
  }
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

/** Get set of canonicalized axisSpecs from axisTree */
export function getSetFromAxisTree(tree: AxisTree): Set<CanonicalizedJson<AxisId>> {
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
  for (const linker of compositeLinkers.filter((l) => readAnnotation(l.spec, Annotation.IsLinkerColumn) === 'true')) {
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
  const allAvailableKeys: Set<LinkerKey> = new Set();
  let nextKeys = sourceAxesKeys;
  while (nextKeys.length) {
    const next: LinkerKey[] = [];
    for (const key of nextKeys) {
      const node = linkersMap.get(key);
      if (node) {
        for (const availableKey of node.linkWith.keys()) {
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
  startKey: LinkerKey,
  endKey: LinkerKey,
): PColumnIdAndSpec[] {
  const previous: Record<LinkerKey, LinkerKey> = {};
  const visited: Set<LinkerKey> = new Set([startKey]);
  let nextIds: Set<LinkerKey> = new Set([startKey]);
  while (nextIds.size) {
    const next: Set<LinkerKey> = new Set();
    for (const nextId of nextIds) {
      const node = linkerColumnsMap.get(nextId);
      if (node) {
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
  // target keys contain all axes to be linked; if some of target axes has parents they must be in the key
  const targetRoots: AxisSpecNormalized[] = getAxesRoots(targetAxes);
  const targetKeys: LinkerKey[] = targetRoots.map(getLinkerKeyFromAxisSpec);

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
export function getAxesListFromKeysList(keys: LinkerKey[], linkerMap: CompositeLinkerMap): AxisSpecNormalized[] {
  const availableAxes: AxisSpecNormalized[] = [];
  const availableAxesKeySet: Set<CanonicalizedJson<AxisId>> = new Set();

  for (const key of keys) {
    const axes = linkerMap.get(key)?.spec;
    if (axes) {
      for (const axis of axes) {
        const key = canonicalizeJson(getAxisId(axis));
        if (!availableAxesKeySet.has(key)) {
          availableAxesKeySet.add(key);
          availableAxes.push(axis);
        }
      }
    }
  }

  return availableAxes;
}

/** Get axes of target axes that are impossible to be linked to source axes with current linker map */
export function getNonLinkableAxes(
  linkerColumnsMap: CompositeLinkerMap,
  sourceAxes: AxisSpecNormalized[],
  targetAxes: AxisSpecNormalized[],
): AxisSpecNormalized[] {
  // start keys - all possible keys in linker map using sourceAxes (for example, all axes of block's columns or all axes of columns in data-inputs)
  const startKeys: LinkerKey[] = sourceAxes.map(getLinkerKeyFromAxisSpec);
  // target keys contain all axes to be linked; if some of target axes has parents they must be in the key
  const targetRoots: AxisSpecNormalized[] = getAxesRoots(targetAxes);
  const targetKeys: LinkerKey[] = targetRoots.map(getLinkerKeyFromAxisSpec);

  const missedTargetKeys: LinkerKey[] = [];
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
  return getAxesListFromKeysList(missedTargetKeys, linkerColumnsMap);
}

/** Get all axes that are not parents of any other axis */
export function getAxesRoots(axes: AxisSpecNormalized[]): AxisSpecNormalized[] {
  const parentsSet = new Set();
  for (const axis of axes) {
    const parents = axis.parentAxesSpec.map((spec) => canonicalizeJson(getAxisId(spec)));
    for (const parent of parents) {
      parentsSet.add(parent);
    }
  }
  const keys = axes.map((spec) => canonicalizeJson(getAxisId(spec)));
  const result: AxisSpecNormalized[] = [];

  keys.forEach((key, idx) => {
    if (!parentsSet.has(key)) {
      result.push(axes[idx]);
    }
  });
  return result;
}

/** Get all axes that can be connected to sourceAxes by linkers */
export function getReachableByLinkersAxesFromAxes(
  sourceAxes: AxisSpecNormalized[],
  linkersMap: CompositeLinkerMap,
): AxisSpec[] {
  const startKeys: LinkerKey[] = sourceAxes.map(getLinkerKeyFromAxisSpec);
  const availableKeys = searchAvailableAxesKeys(startKeys, linkersMap);
  return getAxesListFromKeysList([...availableKeys], linkersMap);
}
