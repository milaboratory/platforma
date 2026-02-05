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
  Annotation,
  canonicalizeJson,
  getAxisId,
  getColumnIdAndSpec, LinkerMap,
  matchAxisId,
  readAnnotation,
  readAnnotationJson,
  stringifyJson,
} from '@milaboratories/pl-model-common';
import type { PColumnDataUniversal, RenderCtxBase } from '../render';
import { getAllRelatedColumns, getRelatedColumns } from '../pframe_utils/columns';

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

export function isHiddenFromGraphColumn(column: PColumnSpec): boolean {
  return !!readAnnotationJson(column, Annotation.HideDataFromGraphs);
}

export function isHiddenFromUIColumn(column: PColumnSpec): boolean {
  return !!readAnnotationJson(column, Annotation.HideDataFromUi);
}

export type AxesVault = Map<CanonicalizedJson<AxisId>, AxisSpecNormalized>;

export function getAvailableWithLinkersAxes(
  linkerColumns: (PColumn<PColumnDataUniversal>)[],
  blockAxes: AxesVault,
): AxesVault {
  const linkerMap = LinkerMap.fromColumns(linkerColumns.map(getColumnIdAndSpec));
  const availableAxes = linkerMap.getReachableByLinkersAxesFromAxesNormalized(
    [...blockAxes.values()],
    (linkerKeyId, sourceAxisId) => matchAxisId(sourceAxisId, linkerKeyId),
  );

  return new Map(availableAxes.map((axisSpec) => {
    const id = getAxisId(axisSpec);
    return [canonicalizeJson(id), axisSpec];
  }));
}
/** Add columns with fully compatible axes created from partial compatible ones */
export function enrichCompatible<T extends Omit<PColumn<PColumnDataUniversal>, 'data'>>(blockAxes: AxesVault, columns: T[]): T[] {
  return columns.flatMap((column) => getAdditionalColumnsForColumn(blockAxes, column));
}

function getAdditionalColumnsForColumn<T extends Omit<PColumn<PColumnDataUniversal>, 'data'>>(
  blockAxes: AxesVault,
  column: T,
): T[] {
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
      ...column,
      id: id as PObjectId,
      spec: {
        ...column.spec,
        axesSpec: idsList.map((axisId, idx) => ({
          ...axisId,
          annotations: column.spec.axesSpec[idx].annotations,
        })),
        annotations,
      },
    };
  });

  return [column, ...additionalColumns];
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
  ctx: RenderCtxBase<A, U>,
  blockColumns?: PColumn<PColumnDataUniversal>[],
): PFrameHandle | undefined {
  const suitableSpec = (spec: PColumnSpec) => !isHiddenFromUIColumn(spec) && !isHiddenFromGraphColumn(spec);
  // if current block doesn't produce own columns then use all columns from result pool
  if (!blockColumns) {
    return ctx.createPFrame(getAllRelatedColumns(ctx, suitableSpec));
  };

  return ctx.createPFrame(getRelatedColumns(ctx, { columns: blockColumns, predicate: suitableSpec }));
}
