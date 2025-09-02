import type {
  AxisId,
  AxisSpecNormalized,
  CanonicalizedJson,
  PColumn,
  PColumnSpec,
  PFrameHandle,
  PObjectId,
} from '@milaboratories/pl-model-common';
import {
  canonicalizeJson,
  getAxisId,
  isDataInfo,
  matchAxisId,
  visitDataInfo,
  getColumnIdAndSpec,
  Annotation,
  readAnnotation,
  getNormalizedAxesList,
  stringifyJson,
  readAnnotationJson,
  LinkerMap,
  getArrayFromAxisTree,
  getAxesTree,
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
export function isLinkerColumn(column: PColumnSpec): boolean {
  return !!readAnnotationJson(column, Annotation.IsLinkerColumn);
}

function isHiddenFromGraphColumn(column: PColumnSpec): boolean {
  return !!readAnnotationJson(column, Annotation.HideDataFromGraphs);
}

type AxesVault = Map<CanonicalizedJson<AxisId>, AxisSpecNormalized>;

export function getAvailableWithLinkersAxes(
  linkerColumns: PColumn<PColumnDataUniversal>[],
  blockAxes: AxesVault,
): AxesVault {
  const linkerMap = LinkerMap.fromColumns(linkerColumns.map(getColumnIdAndSpec));
  const startKeys: CanonicalizedJson<AxisId[]>[] = [];
  const blockAxesGrouped: AxisId[][] = [...blockAxes.values()].map((axis) => getArrayFromAxisTree(getAxesTree(axis)).map(getAxisId));

  for (const axesGroupBlock of blockAxesGrouped) {
    const matched = linkerMap.keyAxesIds.find(
      (keyIds: AxisId[]) => keyIds.every(
        (keySourceAxis) => axesGroupBlock.find((axisSpecFromBlock) => matchAxisId(axisSpecFromBlock, keySourceAxis)),
      ),
    );
    if (matched) {
      startKeys.push(canonicalizeJson(matched)); // linker column can contain fewer domains than in block's columns, it's fixed on next step in enrichCompatible
    }
  }

  const availableKeys = linkerMap.searchAvailableAxesKeys(startKeys);
  const availableAxes = linkerMap.getAxesListFromKeysList([...availableKeys]);

  return new Map(availableAxes.map((axisSpec) => {
    const id = getAxisId(axisSpec);
    return [canonicalizeJson(id), axisSpec];
  }));
}
/** Add columns with fully compatible axes created from partial compatible ones */
export function enrichCompatible(blockAxes: AxesVault, columns: PColumn<PColumnDataUniversal>[]) {
  const result: PColumn<PColumnDataUniversal>[] = [];
  columns.forEach((column) => {
    result.push(...getAdditionalColumnsForColumn(blockAxes, column));
  });
  return result;
}

function getAdditionalColumnsForColumn(
  blockAxes: AxesVault,
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

    const label = readAnnotation(column.spec, Annotation.Label) ?? '';
    const labelDomainPart = ([...addedByVariantsDomainValues[idx]])
      .filter((str) => addedNotToAllVariantsDomainValues.has(str))
      .sort()
      .map((v) => JSON.parse(v)?.[1]) // use in labels only domain values, but sort them by key to save the same order in all column variants
      .join(' / ');

    const annotations: Annotation = {
      ...column.spec.annotations,
      [Annotation.Graph.IsVirtual]: stringifyJson(true),
    };
    if (label || labelDomainPart) {
      annotations[Annotation.Label] = label && labelDomainPart ? label + ' / ' + labelDomainPart : label + labelDomainPart;
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

export function isColumnReady(c: PColumn<PColumnDataUniversal>) {
  let ready = true;
  if (c.data instanceof TreeNodeAccessor) {
    ready = ready && c.data.getIsReadyOrError();
  } else if (isDataInfo(c.data)) {
    visitDataInfo(c.data, (v) => {
      ready = ready && v.getIsReadyOrError();
    });
  }
  return ready;
}

export function allColumnsReady(columns: PColumn<PColumnDataUniversal>[]): boolean {
  return columns.every(isColumnReady);
}

/**
 The aim of createPFrameForGraphs: to create pframe with block’s columns and all compatible columns from result pool
 (including linker columns and all label columns).
 Block’s columns are added to pframe as is.
 Other columns are added basing on set of axes of block’s columns, considering available with linker columns.
 Compatible columns must have at least one axis from block’s axes set. This axis of the compatible column from
 result pool must satisfy matchAxisId (it can have less domain keys than in block’s axis, but without conflicting values
 among existing ones).
 In requests to pframe (calculateTableData) columns must have strictly the same axes. For compatibility in case
 of partially matched axis we add to pframe a copy of this column with modified axis (with filled missed domains)
 and modified label (with added domain values in case if more than one copy with different domains exist).
 */
export function createPFrameForGraphs<A, U>(
  ctx: RenderCtx<A, U>,
  blockColumns?: PColumn<PColumnDataUniversal>[],
): PFrameHandle | undefined {
  // if current block doesn't produce own columns then use all columns from result pool
  if (!blockColumns) {
    const columns = new PColumnCollection();
    columns.addColumnProvider(ctx.resultPool);

    const allColumns = columns.getColumns(() => true, { dontWaitAllData: true, overrideLabelAnnotation: false }) ?? [];
    // if at least one column is not yet ready, we can't show the graph
    if (!allColumnsReady(allColumns)) {
      return undefined;
    }

    const allAxes: AxesVault = new Map(allColumns
      .flatMap((column) => getNormalizedAxesList(column.spec.axesSpec))
      .map((axisSpec) => {
        const axisId = getAxisId(axisSpec);
        return [canonicalizeJson(axisId), axisSpec];
      }));

    // additional columns are duplicates with extra fields in domains for compatibility if there are ones with partial match
    const extendedColumns = enrichCompatible(allAxes, allColumns);

    return ctx.createPFrame(extendedColumns);
  };

  if (!allColumnsReady(blockColumns)) {
    return undefined;
  }

  // if current block has its own columns then take from result pool only compatible with them
  const columns = new PColumnCollection();
  columns.addColumnProvider(ctx.resultPool);
  columns.addColumns(blockColumns);

  // all possible axes from block columns
  const blockAxes: AxesVault = new Map();
  // axes from block columns and compatible result pool columns
  const allAxes: AxesVault = new Map();
  for (const c of blockColumns) {
    for (const spec of getNormalizedAxesList(c.spec.axesSpec)) {
      const aid = getAxisId(spec);
      blockAxes.set(canonicalizeJson(aid), spec);
      allAxes.set(canonicalizeJson(aid), spec);
    }
  }

  // all linker columns always go to pFrame - even it's impossible to use some of them they all are hidden
  const linkerColumns = columns.getColumns((spec) => isLinkerColumn(spec)) ?? [];
  const availableWithLinkersAxes = getAvailableWithLinkersAxes(linkerColumns, blockAxes);

  // all possible axes from connected linkers
  for (const item of availableWithLinkersAxes) {
    blockAxes.set(...item);
    allAxes.set(...item);
  }

  // all compatible with block columns but without label columns
  let compatibleWithoutLabels = (columns.getColumns((spec) => !isHiddenFromGraphColumn(spec) && spec.axesSpec.some((axisSpec) => {
    const axisId = getAxisId(axisSpec);
    return Array.from(blockAxes.values()).some((selectorAxisSpec) => matchAxisId(getAxisId(selectorAxisSpec), axisId));
  }), { dontWaitAllData: true, overrideLabelAnnotation: false }) ?? []).filter((column) => !isLabelColumn(column.spec));

  // if at least one column is not yet ready, we can't show the graph
  if (!allColumnsReady(compatibleWithoutLabels)) {
    return undefined;
  }

  // extend axes set for label columns request
  for (const c of compatibleWithoutLabels) {
    for (const spec of getNormalizedAxesList(c.spec.axesSpec)) {
      const aid = getAxisId(spec);
      allAxes.set(canonicalizeJson(aid), spec);
    }
  }

  // extend allowed columns - add columns thad doesn't have axes from block, but have all axes in 'allAxes' list (that means all axes from linkers or from 'hanging' of other selected columns)
  compatibleWithoutLabels = (columns.getColumns((spec) => !isHiddenFromGraphColumn(spec) && spec.axesSpec.every((axisSpec) => {
    const axisId = getAxisId(axisSpec);
    return Array.from(allAxes.values()).some((selectorAxisSpec) => matchAxisId(getAxisId(selectorAxisSpec), axisId));
  }), { dontWaitAllData: true, overrideLabelAnnotation: false }) ?? []).filter((column) => !isLabelColumn(column.spec));

  // label columns must be compatible with full set of axes - block axes and axes from compatible columns from result pool
  const compatibleLabels = (columns.getColumns((spec) => !isHiddenFromGraphColumn(spec) && spec.axesSpec.some((axisSpec) => {
    const axisId = getAxisId(axisSpec);
    return Array.from(allAxes.values()).some((selectorAxisSpec) => matchAxisId(getAxisId(selectorAxisSpec), axisId));
  }), { dontWaitAllData: true, overrideLabelAnnotation: false }) ?? []).filter((column) => isLabelColumn(column.spec));

  // if at least one column is not yet ready, we can't show the graph
  if (!allColumnsReady(compatibleLabels)) {
    return undefined;
  }

  const compatible = [...compatibleWithoutLabels, ...compatibleLabels];

  // additional columns are duplicates with extra fields in domains for compatibility if there are ones with partial match
  const extendedColumns = enrichCompatible(blockAxes, compatible);

  return ctx.createPFrame(extendedColumns);
}
