import type {
  AxisId,
  CanonicalizedJson,
  DataInfo,
  PColumn,
  PColumnSpec,
  PColumnSpecId,
  PColumnValues,
  PFrameHandle,
  PObjectId,
} from '@milaboratories/pl-model-common';
import {
  canonicalizeAxisId,
  canonicalizeJson,
  getAxisId,
  getPColumnSpecId,
  isPColumn,
  matchAxisId,
} from '@milaboratories/pl-model-common';
import type { RenderCtx } from '../render';
import { TreeNodeAccessor } from '../render';

/** Create id for column copy with added keys in axes domains */
const colId = (id: PObjectId, domains: (Record<string, string> | undefined)[]) => {
  let wid = id.toString();
  domains?.forEach((domain) => {
    if (domain) {
      for (const [k, v] of Object.entries(domain)) {
        wid += k;
        wid += v;
      }
    }
  });
  return wid;
};

/** All combinations with 1 key from each list */
function getKeysCombinations(idsLists: AxisId[][]) {
  if (!idsLists.length) {
    return [];
  }
  let result: AxisId[][] = [[]];
  idsLists.forEach((list) => {
    const nextResult: AxisId[][] = [];
    list.forEach((key) => {
      nextResult.push(...result.map((resultItem) => [...resultItem, key]));
    });
    result = nextResult;
  });
  return result;
}

type LinkerColumnsMap = Record<string, Record<string, { id: string, spec: PColumnSpec }>>;
export const IS_LINKER_COLUMN = 'pl7.app/isLinkerColumn';
export function getLinkerColumnsMap(linkerColumns:PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor> | PColumnValues>[]) {
  const resultMap: LinkerColumnsMap = {};
  for (const {id, spec} of linkerColumns) {
    const axesSpec = spec.axesSpec ?? [];
    if (axesSpec.length !== 2) {
      throw Error(`Linker column with wrong axes count: ${canonicalizeJson(spec)}`)
    }
    if (axesSpec.length) {
      const [axisA, axisB] = axesSpec;
      const idA = canonicalizeAxisId(getAxisId(axisA));
      const idB = canonicalizeAxisId(getAxisId(axisB));
      if (!resultMap[idA]) {
        resultMap[idA] = {};
      }
      if (!resultMap[idB]) {
        resultMap[idB] = {};
      }
      resultMap[idA][idB] = {id, spec};
      resultMap[idB][idA] = {id, spec};
    }
  }
  return resultMap;
}

export function hasPathWithLinkerColumns(
    linkerColumnsMap:LinkerColumnsMap,
    startId: AxisId,
    endId: AxisId
):boolean {
  const linkerColumnsMapIds = Object.keys(linkerColumnsMap).map((str) => JSON.parse(str) as AxisId);
  const startIdMatched = linkerColumnsMapIds.find((id) => matchAxisId(startId, id));
  if (!startIdMatched) {
    return false;
  }
  const startKey = canonicalizeAxisId(startIdMatched);
  const visited = new Set([startKey]);

  let nextKeys = [startKey];
  while (nextKeys.length) {
    const next:string[] = [];
    for (const nextKey of nextKeys) {
      const availableKeys = Object.keys(linkerColumnsMap[nextKey]);
      for (const availableKey of availableKeys) {
        const availableId = JSON.parse(availableKey) as AxisId;
        if (matchAxisId(endId, availableId)) {
          return true;
        } else if (!visited.has(availableKey)) {
          next.push(availableKey);
          visited.add(availableKey);
        }
      }
    }
    nextKeys = next;
  }
  return false;
}


/** Check if axes of secondary column are exactly in axes of main column */
function checkFullCompatibility(
  mainColumn: PColumnSpec,
  secondaryColumn: PColumnSpec,
  linkerColumnsMap?: LinkerColumnsMap
): boolean {
  const mainAxesIds = mainColumn.axesSpec.map(getAxisId);
  const secondaryAxesIds = secondaryColumn.axesSpec.map(getAxisId);
  // with fixed axes (sliced columns) in data-mapping there is enough to have only one axis in intersection
  return secondaryAxesIds.some((id) => mainAxesIds.some((mainId) => matchAxisId(mainId, id) && matchAxisId(id, mainId))) ||
      linkerColumnsMap !== undefined && secondaryAxesIds.some((id) => mainAxesIds.some((mainId) => hasPathWithLinkerColumns(linkerColumnsMap, mainId, id)));
}

/** Check if axes of secondary column are in axes of main column, but they can have compatible difference in domains */
function checkCompatibility(
  mainColumn: PColumnSpec,
  secondaryColumn: PColumnSpec,
  linkerColumnsMap?: LinkerColumnsMap
): boolean {
  const mainAxesIds = mainColumn.axesSpec.map(getAxisId);
  const secondaryAxesIds = secondaryColumn.axesSpec.map(getAxisId);
  // with fixed axes (sliced columns) in data-mapping there is enough to have only one axis in intersection
  return secondaryAxesIds.some((id) => mainAxesIds.some((mainId) => matchAxisId(mainId, id))) ||
      linkerColumnsMap !== undefined && secondaryAxesIds.some((id) => mainAxesIds.some((mainId) => hasPathWithLinkerColumns(linkerColumnsMap, mainId, id)));
}

export const IS_VIRTUAL_COLUMN = 'pl7.app/graph/isVirtual'; // annotation for column duplicates with extended domains
export const LABEL_ANNOTATION = 'pl7.app/label';

/** Main column can have additional domains, if secondary column (meta-column) has all axes match main column axes
 we can add its copy with missed domain fields for compatibility */
function getAdditionalColumnsForPair(
  mainColumn: PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor> | PColumnValues>,
  secondaryColumn: PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor> | PColumnValues>,
  linkerColumnsMap?: LinkerColumnsMap
): PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor> | PColumnValues>[] {
  const mainAxesIds = mainColumn.spec.axesSpec.map(getAxisId);
  const secondaryAxesIds = secondaryColumn.spec.axesSpec.map(getAxisId);

  const isFullCompatible = checkFullCompatibility(mainColumn.spec, secondaryColumn.spec, linkerColumnsMap);
  if (isFullCompatible) { // in this case it isn't necessary to add more columns
    return [];
  }
  const isCompatible = checkCompatibility(mainColumn.spec, secondaryColumn.spec, linkerColumnsMap);
  if (!isCompatible) { // in this case it is impossible to add some compatible column
    return [];
  }
  // options with different possible domains for every axis of secondary column
  const secondaryIdsOptions = secondaryAxesIds.map((id) => {
    return mainAxesIds.filter((mainId) => matchAxisId(mainId, id));
  });
    // all possible combinations of axes with added domains
  const secondaryIdsVariants = getKeysCombinations(secondaryIdsOptions);

  // sets of added to column domain fields
  const allAddedDomainValues = new Set<string>();
  const addedNotToAllVariantsDomainValues = new Set<string>();
  const addedByVariantsDomainValues = secondaryIdsVariants.map((idsList) => {
    const addedSet = new Set<string>();
    idsList.map((axisId, idx) => {
      const d1 = secondaryColumn.spec.axesSpec[idx].domain;
      const d2 = axisId.domain;
      Object.entries(d2 ?? {}).forEach(([key, value]) => {
        if (d1?.[key] === undefined) {
          const item = JSON.stringify([key, value]);
          addedSet.add(item);
          allAddedDomainValues.add(item);
        }
      });
      return ({
        ...axisId,
        annotations: secondaryColumn.spec.axesSpec[idx].annotations,
      });
    });
    return addedSet;
  });
  [...allAddedDomainValues].forEach((addedPart) => {
    if (addedByVariantsDomainValues.some((s) => !s.has(addedPart))) {
      addedNotToAllVariantsDomainValues.add(addedPart);
    }
  });

  return secondaryIdsVariants.map((idsList, idx) => {
    const id = colId(secondaryColumn.id, idsList.map((id) => id.domain));

    const label = secondaryColumn.spec.annotations?.[LABEL_ANNOTATION] ?? '';
    const labelDomainPart = ([...addedByVariantsDomainValues[idx]])
      .filter((str) => addedNotToAllVariantsDomainValues.has(str))
      .sort()
      .map((v) => JSON.parse(v)?.[1]) // use in labels only domain values, but sort them by key to save the same order in all column variants
      .join(' / ');

    const annotations: Record<string, string> = {
      ...secondaryColumn.spec.annotations,
      [IS_VIRTUAL_COLUMN]: 'true',
    };
    if (label || labelDomainPart) {
      annotations[LABEL_ANNOTATION] = label && labelDomainPart ? label + ' / ' + labelDomainPart : label + labelDomainPart;
    }

    return {
      id: id as PObjectId,
      spec: {
        ...secondaryColumn.spec,
        axesSpec: idsList.map((axisId, idx) => ({
          ...axisId,
          annotations: secondaryColumn.spec.axesSpec[idx].annotations,
        })),
        annotations,
      },
      data: secondaryColumn.data,
    };
  });
}

export function getAdditionalColumns(
  columns: PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor> | PColumnValues>[],
  linkerColumnsMap: LinkerColumnsMap = {}
): PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor> | PColumnValues>[] {
  const additionalColumns: PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor> | PColumnValues>[] = [];
  for (let i = 0; i < columns.length; i++) {
    for (let j = i + 1; j < columns.length; j++) {
      const column1 = columns[i];
      const column2 = columns[j];

      // check if column 1 is meta for column 2 or backward
      additionalColumns.push(
        ...getAdditionalColumnsForPair(column1, column2, linkerColumnsMap),
        ...getAdditionalColumnsForPair(column2, column1, linkerColumnsMap),
      );
    }
  }
  return additionalColumns;
}

export function getAdditionalLinkerColumns(
    mainColumns: PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor> | PColumnValues>[],
    linkerColumns: PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor> | PColumnValues>[]
) {
  const additionalColumns: PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor> | PColumnValues>[] = [];
  for (let i = 0; i < mainColumns.length; i++) {
    for (let j = 0; j < linkerColumns.length; j++) {
      const mainColumn = mainColumns[i];
      const linkerColumn = linkerColumns[j];

      // check if linker column is compatible with other columns as secondary
      additionalColumns.push(...getAdditionalColumnsForPair(mainColumn, linkerColumn));
    }
  }
  return additionalColumns;
}

export function enrichColumnsWithCompatible(
  mainColumns: PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor> | PColumnValues>[],
  secondaryColumns: PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor> | PColumnValues>[],
  linkerColumns: PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor> | PColumnValues>[] = [],
  linkerColumnsMap: LinkerColumnsMap = {}
): PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor> | PColumnValues>[] {
  const mainColumnsIds = new Set<PObjectId>();
  const mainColumnsBySpec = new Map<CanonicalizedJson<PColumnSpecId>, typeof mainColumns[number]>();
  mainColumns.forEach((column) => {
    mainColumnsIds.add(column.id);
    mainColumnsBySpec.set(canonicalizeJson(getPColumnSpecId(column.spec)), column);
  });

  const secondaryColumnsBySpec = new Map<CanonicalizedJson<PColumnSpecId>, typeof secondaryColumns[number]>();
  for (const secondaryColumn of secondaryColumns) {
    if (mainColumnsIds.has(secondaryColumn.id)) continue;

    const spec = canonicalizeJson(getPColumnSpecId(secondaryColumn.spec));
    if (mainColumnsBySpec.has(spec)) continue;

    for (const mainColumn of mainColumnsBySpec.values()) {
      if (checkCompatibility(mainColumn.spec, secondaryColumn.spec, linkerColumnsMap)) {
        secondaryColumnsBySpec.set(spec, secondaryColumn);
        break;
      }
    }
  }

  for (const linkerColumn of linkerColumns) {
    if (mainColumnsIds.has(linkerColumn.id)) continue;

    const spec = canonicalizeJson(getPColumnSpecId(linkerColumn.spec));
    if (mainColumnsBySpec.has(spec)) continue;
    if (secondaryColumnsBySpec.has(spec)) continue;

    mainColumnsIds.add(linkerColumn.id);
    mainColumnsBySpec.set(spec, linkerColumn);
  }

  return [...mainColumnsBySpec.values(), ...secondaryColumnsBySpec.values()];
}

export function createPFrameForGraphs<A, U>(
  ctx: RenderCtx<A, U>,
  blockColumns: PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor> | PColumnValues>[] | undefined,
): PFrameHandle | undefined {
  if (!blockColumns) return undefined;

  const upstreamColumns = ctx.resultPool
    .getData()
    .entries.map((v) => v.obj)
    .filter(isPColumn);

  const allAvailableColumns = [...blockColumns, ...upstreamColumns];
  // all linker columns always go to pFrame - even it's impossible to use some of them they all are hidden
  const linkerColumns = allAvailableColumns.filter((item) => item.spec.annotations?.[IS_LINKER_COLUMN] === 'true');

  const linkerColumnsMap = getLinkerColumnsMap(linkerColumns);
  const columnsWithCompatibleFromUpstream = enrichColumnsWithCompatible(blockColumns, upstreamColumns, linkerColumns, linkerColumnsMap);

  // additional columns are duplicates with extra fields in domains for compatibility in all possible pairs of columns set
  const extendedColumns = [...columnsWithCompatibleFromUpstream, ...getAdditionalColumns(columnsWithCompatibleFromUpstream, linkerColumnsMap)];

  // if at least one column is not yet ready, we can't show the table
  if (
    extendedColumns.some(
      (a) => a.data instanceof TreeNodeAccessor && !a.data.getIsReadyOrError(),
    )
  )
    return undefined;

  return ctx.createPFrame(extendedColumns);
}
