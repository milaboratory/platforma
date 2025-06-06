import type {
  AxisId, CanonicalizedJson,
  DataInfo,
  PColumn,
  PColumnSpec,
  PColumnValues,
  PFrameHandle,
  PObjectId,
} from '@milaboratories/pl-model-common';
import {
  canonicalizeJson,
  getAxisId,
  matchAxisId, parseJson,
} from '@milaboratories/pl-model-common';
import type { PColumnDataUniversal, RenderCtx } from '../render';
import { PColumnCollection, TreeNodeAccessor } from '../render';
import { isLabelColumn } from './PlDataTable';

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

/** Check if column is a linker column */
export function isLinkerColumn(column: PColumnSpec) {
  return column.axesSpec.length === 2 && column.annotations?.[LINKER_COLUMN_ANNOTATION] === 'true';
}

export const IS_VIRTUAL_COLUMN = 'pl7.app/graph/isVirtual'; // annotation for column duplicates with extended domains
export const LABEL_ANNOTATION = 'pl7.app/label';
export const LINKER_COLUMN_ANNOTATION = 'pl7.app/isLinkerColumn';

export type LinkerColumnsMap = Map<CanonicalizedJson<AxisId>, Set<CanonicalizedJson<AxisId>>>;
export function getLinkerColumnsMap(linkerColumns: PColumn<PColumnDataUniversal>[]) {
  const resultMap: LinkerColumnsMap = new Map();
  for (const { spec } of linkerColumns) {
    const axisIds = spec.axesSpec.map(getAxisId).map(canonicalizeJson);
    axisIds.forEach((id) => {
      if (!resultMap.has(id)) {
        resultMap.set(id, new Set());
      }
    });
    for (let i = 0; i < axisIds.length - 1; i++) {
      for (let j = i + 1; j < axisIds.length; j++) {
        const id1 = axisIds[i];
        const id2 = axisIds[j];
        resultMap.get(id1)?.add(id2);
        resultMap.get(id2)?.add(id1);
      }
    }
  }
  return resultMap;
}

export function getAvailableWithLinkersAxes(
  linkerColumns: PColumn<PColumnDataUniversal>[],
  blockAxes: Map<CanonicalizedJson<AxisId>, AxisId>,
): Map<CanonicalizedJson<AxisId>, AxisId> {
  const linkerColumnsMap = getLinkerColumnsMap(linkerColumns);
  const linkerColumnsMapIds = [...linkerColumnsMap.keys()].map(parseJson);
  const startKeys: CanonicalizedJson<AxisId>[] = [];
  for (const startId of blockAxes.values()) {
    const matched = linkerColumnsMapIds.find((id) => matchAxisId(startId, id));
    if (matched) {
      startKeys.push(canonicalizeJson(matched)); // linker column can contain fewer domains than in block's columns, it's fixed on next step in enrichCompatible
    }
  }
  const visited: Set<CanonicalizedJson<AxisId>> = new Set(startKeys);
  const addedAvailableAxes: Map<CanonicalizedJson<AxisId>, AxisId> = new Map();
  let nextKeys = [...startKeys];

  while (nextKeys.length) {
    const next: CanonicalizedJson<AxisId>[] = [];
    for (const nextKey of nextKeys) {
      for (const availableKey of linkerColumnsMap.get(nextKey) ?? []) {
        if (!visited.has(availableKey)) {
          next.push(availableKey);
          visited.add(availableKey);
          addedAvailableAxes.set(availableKey, parseJson(availableKey));
        }
      }
    }
    nextKeys = next;
  }
  return addedAvailableAxes;
}
/** Add columns with fully compatible axes created from partial compatible ones */
export function enrichCompatible(blockAxes: Map<string, AxisId>, columns: PColumn<PColumnDataUniversal>[]) {
  const result: PColumn<PColumnDataUniversal>[] = [];
  columns.forEach((column) => {
    result.push(...getAdditionalColumnsForColumn(blockAxes, column));
  });
  return result;
}

function getAdditionalColumnsForColumn(
  blockAxes: Map<string, AxisId>,
  column: PColumn<PColumnDataUniversal>,
): PColumn<PColumnDataUniversal>[] {
  const columnAxesIds = column.spec.axesSpec.map(getAxisId);

  if (columnAxesIds.every((id) => blockAxes.has(canonicalizeJson(id)))) {
    return [column]; // the column is compatible with its own domains without modifications
  }

  // options with different possible domains for every axis of secondary column
  const secondaryIdsOptions = columnAxesIds.map((id) => {
    const result = [];
    for (const [_, mainId] of blockAxes) {
      if (matchAxisId(mainId, id) && !matchAxisId(id, mainId)) {
        result.push(mainId);
      }
    }
    return result;
  });
  // all possible combinations of axes with added domains
  const secondaryIdsVariants = getKeysCombinations(secondaryIdsOptions);

  // sets of added to column domain fields
  const allAddedDomainValues = new Set<string>();
  const addedNotToAllVariantsDomainValues = new Set<string>();
  const addedByVariantsDomainValues = secondaryIdsVariants.map((idsList) => {
    const addedSet = new Set<string>();
    idsList.map((axisId, idx) => {
      const d1 = column.spec.axesSpec[idx].domain;
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
        annotations: column.spec.axesSpec[idx].annotations,
      });
    });
    return addedSet;
  });
  [...allAddedDomainValues].forEach((addedPart) => {
    if (addedByVariantsDomainValues.some((s) => !s.has(addedPart))) {
      addedNotToAllVariantsDomainValues.add(addedPart);
    }
  });

  const additionalColumns = secondaryIdsVariants.map((idsList, idx) => {
    const id = colId(column.id, idsList.map((id) => id.domain));

    const label = column.spec.annotations?.[LABEL_ANNOTATION] ?? '';
    const labelDomainPart = ([...addedByVariantsDomainValues[idx]])
      .filter((str) => addedNotToAllVariantsDomainValues.has(str))
      .sort()
      .map((v) => JSON.parse(v)?.[1]) // use in labels only domain values, but sort them by key to save the same order in all column variants
      .join(' / ');

    const annotations: Record<string, string> = {
      ...column.spec.annotations,
      [IS_VIRTUAL_COLUMN]: 'true',
    };
    if (label || labelDomainPart) {
      annotations[LABEL_ANNOTATION] = label && labelDomainPart ? label + ' / ' + labelDomainPart : label + labelDomainPart;
    }

    return {
      id: id as PObjectId,
      spec: {
        ...column.spec,
        axesSpec: idsList.map((axisId, idx) => ({
          ...axisId,
          annotations: column.spec.axesSpec[idx].annotations,
        })),
        annotations,
      },
      data: column.data,
    };
  });

  return [column, ...additionalColumns];
}

export function createPFrameForGraphs<A, U>(
  ctx: RenderCtx<A, U>,
  blockColumns: PColumn<PColumnDataUniversal>[] | undefined,
): PFrameHandle | undefined {
  if (!blockColumns) return undefined;

  const columns = new PColumnCollection();
  columns.addColumnProvider(ctx.resultPool);
  columns.addColumns(blockColumns);

  // all possible axes from block columns
  const allAxes = new Map<CanonicalizedJson<AxisId>, AxisId>();
  for (const c of blockColumns) {
    for (const id of c.spec.axesSpec) {
      const aid = getAxisId(id);
      allAxes.set(canonicalizeJson(aid), aid);
    }
  }

  // all linker columns always go to pFrame - even it's impossible to use some of them they all are hidden
  const linkerColumns = columns.getColumns((spec) => isLinkerColumn(spec)) ?? [];
  const availableWithLinkersAxes = getAvailableWithLinkersAxes(linkerColumns, allAxes);
  const labelColumns = columns.getColumns(isLabelColumn) ?? [];

  // all possible axes from connected linkers
  for (const item of availableWithLinkersAxes) {
    allAxes.set(...item);
  }

  let compatible = (columns.getColumns([...allAxes.values()]
    .map((ax) => ({
      axes: [ax],
      partialAxesMatch: true,
    }))) ?? []).filter((column) => !isLabelColumn(column.spec));
  compatible = compatible.concat(labelColumns); // add all available labels columns to avoid problems with fixed axes, but don't add twice

  // additional columns are duplicates with extra fields in domains for compatibility if there are ones with partial match
  const extendedColumns = enrichCompatible(allAxes, compatible);

  // if at least one column is not yet ready, we can't show the table
  if (
    extendedColumns.some(
      (a) => a.data instanceof TreeNodeAccessor && !a.data.getIsReadyOrError(),
    )
  )
    return undefined;

  return ctx.createPFrame(extendedColumns);
}
