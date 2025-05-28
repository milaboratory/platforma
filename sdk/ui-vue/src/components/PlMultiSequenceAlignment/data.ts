import { isJsonEqual } from '@milaboratories/helpers';
import type { ListOptionNormalized } from '@milaboratories/uikit';
import type {
  CalculateTableDataRequest,
  CanonicalizedJson,
  JoinEntry,
  PColumnIdAndSpec,
  PColumnPredicate,
  PFrameHandle,
  PlSelectionModel,
  PObjectId,
  PTableColumnId,
} from '@platforma-sdk/model';
import {
  canonicalizeJson,
  createRowSelectionColumn,
  getAxisId,
  getRawPlatformaInstance,
  isLabelColumn,
  matchAxisId,
  parseJson,
  pTableValue,
} from '@platforma-sdk/model';
import { computedAsync } from '@vueuse/core';
import type { MaybeRefOrGetter } from 'vue';
import { toValue } from 'vue';
import type { Annotation, SequenceRow } from './types';

const getPFrameDriver = () => getRawPlatformaInstance().pFrameDriver;

const getEmptyOptions = () => ({ defaults: [], options: [] });

export function useSequenceColumnsOptions(
  params: MaybeRefOrGetter<{
    pFrame: PFrameHandle | undefined;
    sequenceColumnPredicate: PColumnPredicate;
  }>,
) {
  const result = computedAsync(
    () => getSequenceColumnsOptions(toValue(params)),
    getEmptyOptions(),
    { onError: () => (result.value = getEmptyOptions()) },
  );
  return result;
}

export function useLabelColumnsOptions(
  params: MaybeRefOrGetter<{
    pFrame: PFrameHandle | undefined;
    sequenceColumnIds: PObjectId[];
    labelColumnOptionPredicate:
      | ((column: PColumnIdAndSpec) => boolean)
      | undefined;
  }>,
) {
  const result = computedAsync(
    () => getLabelColumnsOptions(toValue(params)),
    getEmptyOptions(),
    { onError: () => (result.value = getEmptyOptions()) },
  );
  return result;
}

export function useAnnotationColumnOptions(
  pFrame: MaybeRefOrGetter<PFrameHandle | undefined>,
) {
  const result = computedAsync(
    () => getAnnotationColumns(toValue(pFrame)),
    [],
    { onError: () => (result.value = []) },
  );
  return result;
}

export function useSequenceRows(
  params: MaybeRefOrGetter<{
    pframe: PFrameHandle | undefined;
    sequenceColumnIds: PObjectId[];
    labelColumnIds: PTableColumnId[];
    annotationColumnId: PObjectId | undefined;
    linkerColumnPredicate: PColumnPredicate | undefined;
    selection: PlSelectionModel | undefined;
  }>,
) {
  const result = computedAsync(
    () => getSequenceRows(toValue(params)),
    { data: [], annotationLabels: {} },
    { onError: () => (result.value = { data: [], annotationLabels: {} }) },
  );
  return result;
}

async function getSequenceColumnsOptions({
  pFrame,
  sequenceColumnPredicate,
}: {
  pFrame: PFrameHandle | undefined;
  sequenceColumnPredicate: (column: PColumnIdAndSpec) => boolean;
}): Promise<{
    options: ListOptionNormalized<PObjectId>[];
    defaults: PObjectId[];
  }> {
  if (!pFrame) return getEmptyOptions();
  const pFrameDriver = getPFrameDriver();
  const columns = await pFrameDriver.listColumns(pFrame);
  const options = columns
    .filter((column) => sequenceColumnPredicate(column))
    .map(({ spec, columnId }) => ({
      label: spec.annotations?.['pl7.app/label'] ?? 'Unlabelled column',
      value: columnId,
    }));
  const defaults = options.map(({ value }) => value);
  return { options, defaults };
}

async function getLabelColumnsOptions({
  pFrame,
  sequenceColumnIds,
  labelColumnOptionPredicate,
}: {
  pFrame: PFrameHandle | undefined;
  sequenceColumnIds: PObjectId[];
  labelColumnOptionPredicate:
    | ((column: PColumnIdAndSpec) => boolean)
    | undefined;
}): Promise<{
    options: ListOptionNormalized<PTableColumnId>[];
    defaults: PTableColumnId[];
  }> {
  if (!pFrame) return getEmptyOptions();
  const pFrameDriver = getPFrameDriver();
  const columns = await pFrameDriver.listColumns(pFrame);
  const optionMap = new Map<CanonicalizedJson<PTableColumnId>, string>();
  for (const column of columns) {
    if (sequenceColumnIds.includes(column.columnId)) {
      for (const axisSpec of column.spec.axesSpec) {
        const axisId = getAxisId(axisSpec);
        const axisIdJson = canonicalizeJson({ type: 'axis', id: axisId });
        if (optionMap.has(axisIdJson)) continue;
        const labelColumn = columns.find(
          ({ spec }) =>
            isLabelColumn(spec)
            && matchAxisId(axisId, getAxisId(spec.axesSpec[0])),
        );
        optionMap.set(
          labelColumn
            ? canonicalizeJson({ type: 'column', id: labelColumn.columnId })
            : axisIdJson,
          axisSpec.annotations?.['pl7.app/label'] ?? 'Unlabelled axis',
        );
      }
    }
    if (labelColumnOptionPredicate?.(column)) {
      optionMap.set(
        canonicalizeJson({ type: 'column', id: column.columnId }),
        column.spec.annotations?.['pl7.app/label'] ?? 'Unlabelled column',
      );
    }
  }
  const options = Array.from(optionMap)
    .map(([value, label]) => ({ label, value: parseJson(value) }));
  const defaults = options
    .filter(({ value }) => {
      if (value.type === 'axis') return true;
      const column = columns.find(({ columnId }) => columnId === value.id);
      return column && isLabelColumn(column.spec);
    })
    .map(({ value }) => value);
  return { options, defaults };
}

async function getAnnotationColumns(
  pFrame: PFrameHandle | undefined,
): Promise<ListOptionNormalized<PObjectId>[]> {
  if (!pFrame) return [];
  const pFrameDriver = getPFrameDriver();
  const columns = await pFrameDriver.listColumns(pFrame);
  return columns.flatMap(({ spec: { annotations }, columnId }) => {
    if (
      annotations?.['pl7.app/sequence/isAnnotation'] !== 'true'
      || annotations?.['pl7.app/sequence/isLiabilityDone'] === 'true'
    ) return [];
    return {
      label: annotations?.['pl7.app/label'] ?? 'Unlabelled column',
      value: columnId,
    };
  });
}

async function getSequenceRows(
  {
    pframe,
    sequenceColumnIds,
    labelColumnIds,
    annotationColumnId,
    linkerColumnPredicate,
    selection,
  }: {
    pframe: PFrameHandle | undefined;
    sequenceColumnIds: PObjectId[];
    labelColumnIds: PTableColumnId[];
    annotationColumnId: PObjectId | undefined;
    linkerColumnPredicate: PColumnPredicate | undefined;
    selection: PlSelectionModel | undefined;
  },
): Promise<{
    data: SequenceRow[];
    annotationLabels: Record<string, string>;
  }> {
  if (!pframe || !sequenceColumnIds.length) {
    return { data: [], annotationLabels: {} };
  }

  const pFrameDriver = getPFrameDriver();
  const columns = await pFrameDriver.listColumns(pframe);
  const linkerColumns = linkerColumnPredicate
    ? columns.filter((c) => linkerColumnPredicate(c))
    : [];
  const filterColumn = createRowSelectionColumn({ selection });

  // inner join of sequence columns
  let primaryEntry: JoinEntry<PObjectId> = {
    type: 'inner',
    entries: sequenceColumnIds.map((column) => ({
      type: 'column',
      column,
    })),
  };

  // if we have linkers, left join them
  if (linkerColumns.length > 0) {
    primaryEntry = {
      type: 'outer',
      primary: primaryEntry,
      secondary: linkerColumns.map(({ columnId }) => ({
        type: 'column',
        column: columnId,
      })),
    };
  }

  // inner join with filters
  if (filterColumn) {
    primaryEntry = {
      type: 'inner',
      entries: [
        primaryEntry,
        {
          type: 'inlineColumn',
          column: filterColumn,
        },
      ],
    };
  }

  // left join with labels
  const secondaryEntry: JoinEntry<PObjectId>[] = labelColumnIds
    .flatMap((column) => {
      if (column.type !== 'column') return [];
      return { type: 'column', column: column.id };
    });

  // and annotations
  if (annotationColumnId) {
    secondaryEntry.push({ type: 'column', column: annotationColumnId });
  }

  const request: CalculateTableDataRequest<PObjectId> = {
    src: {
      type: 'outer',
      primary: primaryEntry,
      secondary: secondaryEntry,
    },
    filters: [],
    sorting: sequenceColumnIds.map((id) => ({
      column: {
        type: 'column',
        id,
      },
      ascending: true,
      naAndAbsentAreLeastValues: true,
    })),
  };

  const table = await pFrameDriver.calculateTableData(
    pframe,
    JSON.parse(JSON.stringify(request)),
  );

  const sequenceColumns = sequenceColumnIds.map((columnId) => {
    const column = table.find(({ spec }) => spec.id === columnId);
    if (!column) {
      throw new Error(
        `Can't find a sequence column (ID: \`${columnId}\`) in the calculateTableData output.`,
      );
    }
    return column;
  });

  const labelColumns = labelColumnIds.map((labelColumn) => {
    const column = table.find(({ spec }) => {
      if (labelColumn.type === 'axis' && spec.type === 'axis') {
        return isJsonEqual(labelColumn.id, spec.id);
      }
      if (labelColumn.type === 'column' && spec.type == 'column') {
        return labelColumn.id === spec.id;
      }
    });
    if (!column) {
      throw new Error(
        `Can't find a sequence column (ID: \`${labelColumn}\`) in the calculateTableData output.`,
      );
    }
    return column;
  });

  const annotationColumn = annotationColumnId && table.find(
    ({ spec }) => spec.id === annotationColumnId,
  );

  const annotationLabels = JSON.parse(
    annotationColumn?.spec.spec.annotations
      ?.['pl7.app/sequence/annotation/mapping'] ?? '{}',
  );

  const data = Array.from(
    { length: sequenceColumns[0].data.data.length },
    (_, row) => {
      const fill = { na: '', absent: '' };
      const sequences = sequenceColumns.map(
        (column) => pTableValue(column.data, row, fill)?.toString() ?? '',
      );
      const labels = labelColumns.map(
        (column) => pTableValue(column.data, row, fill)?.toString() ?? '',
      );
      const serializedAnnotations = annotationColumn
        && pTableValue(annotationColumn.data, row, fill);
      const annotations = typeof serializedAnnotations === 'string'
        ? parseAnnotations(serializedAnnotations)
        : [];
      return { sequences, labels, annotations };
    },
  );

  return { data, annotationLabels };
}

function parseAnnotations(row: string): Annotation[] {
  return Array.from(row.matchAll(
    /(?<id>[^:]*):(?<start>[0-9A-Za-z]*)(?:\+(?<length>[0-9A-Za-z]*))?\|?/g,
  )).map((match) => {
    const matchGroups = match.groups as {
      id: string;
      start: string;
      length: string | undefined;
    };
    const start = Number.parseInt(matchGroups.start, 36);
    const length = matchGroups.length
      ? Number.parseInt(matchGroups.length, 36)
      : 0;
    return {
      id: matchGroups.id,
      start,
      length,
    };
  });
}
