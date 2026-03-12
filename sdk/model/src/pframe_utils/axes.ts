/**
 * Axes utilities for PFrame graph operations.
 *
 * Extracted from PFrameForGraphs to break circular dependency
 * between PFrameForGraphs and columns modules.
 *
 * @module pframe_utils/axes
 */

import type {
  AxisId,
  AxisSpecNormalized,
  CanonicalizedJson,
  PColumn,
  PObjectId,
} from "@milaboratories/pl-model-common";
import {
  Annotation,
  canonicalizeJson,
  getAxisId,
  getColumnIdAndSpec,
  LinkerMap,
  matchAxisId,
  readAnnotation,
  stringifyJson,
} from "@milaboratories/pl-model-common";
import type { PColumnDataUniversal } from "../render";

export type AxesVault = Map<CanonicalizedJson<AxisId>, AxisSpecNormalized>;

/** Create id for column copy with added keys in axes domains */
const colId = (
  id: PObjectId,
  domains: (Record<string, string> | undefined)[],
  contextDomains: (Record<string, string> | undefined)[],
) => {
  let wid = id.toString();
  domains?.forEach((domain) => {
    if (domain) {
      for (const [k, v] of Object.entries(domain)) {
        wid += k;
        wid += v;
      }
    }
  });
  contextDomains?.forEach((contextDomain) => {
    if (contextDomain) {
      for (const [k, v] of Object.entries(contextDomain)) {
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

export function getAvailableWithLinkersAxes(
  linkerColumns: PColumn<PColumnDataUniversal>[],
  blockAxes: AxesVault,
): AxesVault {
  const linkerMap = LinkerMap.fromColumns(linkerColumns.map(getColumnIdAndSpec));
  const availableAxes = linkerMap.getReachableByLinkersAxesFromAxesNormalized(
    [...blockAxes.values()],
    (linkerKeyId, sourceAxisId) => matchAxisId(sourceAxisId, linkerKeyId),
  );

  return new Map(
    availableAxes.map((axisSpec) => {
      const id = getAxisId(axisSpec);
      return [canonicalizeJson(id), axisSpec];
    }),
  );
}

/** Add columns with fully compatible axes created from partial compatible ones */
export function enrichCompatible<T extends Omit<PColumn<PColumnDataUniversal>, "data">>(
  blockAxes: AxesVault,
  columns: T[],
): T[] {
  return columns.flatMap((column) => getAdditionalColumnsForColumn(blockAxes, column));
}

function getAdditionalColumnsForColumn<T extends Omit<PColumn<PColumnDataUniversal>, "data">>(
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
      const cd1 = column.spec.axesSpec[idx].contextDomain;
      const cd2 = axisId.contextDomain;
      Object.entries(cd2 ?? {}).forEach(([key, value]) => {
        if (cd1?.[key] === undefined) {
          const item = JSON.stringify(["ctx:" + key, value]);
          addedSet.add(item);
          allAddedDomainValues.add(item);
        }
      });
      return {
        ...axisId,
        annotations: column.spec.axesSpec[idx].annotations,
      };
    });
    return addedSet;
  });
  [...allAddedDomainValues].forEach((addedPart) => {
    if (addedByVariantsDomainValues.some((s) => !s.has(addedPart))) {
      addedNotToAllVariantsDomainValues.add(addedPart);
    }
  });

  const additionalColumns = secondaryIdsVariants.map((idsList, idx) => {
    const id = colId(
      column.id,
      idsList.map((id) => id.domain),
      idsList.map((id) => id.contextDomain),
    );

    const label = readAnnotation(column.spec, Annotation.Label) ?? "";
    const labelDomainPart = [...addedByVariantsDomainValues[idx]]
      .filter((str) => addedNotToAllVariantsDomainValues.has(str))
      .sort()
      .map((v) => JSON.parse(v)?.[1]) // use in labels only domain values, but sort them by key to save the same order in all column variants
      .join(" / ");

    const annotations: Annotation = {
      ...column.spec.annotations,
      [Annotation.Graph.IsVirtual]: stringifyJson(true),
    };
    if (label || labelDomainPart) {
      annotations[Annotation.Label] =
        label && labelDomainPart ? label + " / " + labelDomainPart : label + labelDomainPart;
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
