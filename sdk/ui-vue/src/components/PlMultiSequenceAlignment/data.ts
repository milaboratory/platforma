import type { ListOption } from '@milaboratories/uikit';
import {
  type AxisId,
  type CalculateTableDataRequest,
  type CanonicalizedJson,
  canonicalizeJson,
  createRowSelectionColumn,
  getAxisId,
  getRawPlatformaInstance,
  isLabelColumn,
  matchAxisId,
  parseJson,
  type PColumnIdAndSpec,
  type PColumnPredicate,
  type PFrameHandle,
  type PlSelectionModel,
  type PObjectId,
  type PTableColumnIdAxis,
  type PTableColumnIdColumn,
  type PTableColumnIdJson,
  pTableValue,
  stringifyPTableColumnId,
} from '@platforma-sdk/model';
import { computedAsync } from '@vueuse/core';
import { type MaybeRefOrGetter, toValue } from 'vue';
import type { SequenceRow } from './types';

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

export function useSequenceRows(
  params: MaybeRefOrGetter<{
    pframe: PFrameHandle | undefined;
    sequenceColumnIds: PObjectId[];
    labelColumnIds: PTableColumnIdJson[];
    linkerColumnPredicate: PColumnPredicate | undefined;
    selection: PlSelectionModel | undefined;
  }>,
) {
  const result = computedAsync(
    () => getSequenceRows(toValue(params)),
    [],
    { onError: () => (result.value = []) },
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
  options: ListOption<PObjectId>[];
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

async function getLabelColumnsOptions(
  {
    pFrame,
    sequenceColumnIds,
    labelColumnOptionPredicate,
  }: {
    pFrame: PFrameHandle | undefined;
    sequenceColumnIds: PObjectId[];
    labelColumnOptionPredicate:
      | ((column: PColumnIdAndSpec) => boolean)
      | undefined;
  },
): Promise<{
  options: ListOption<PTableColumnIdJson>[];
  defaults: PTableColumnIdJson[];
}> {
  if (!pFrame) return getEmptyOptions();
  const processedAxes = new Set<CanonicalizedJson<AxisId>>();
  const optionLabels = new Map<PTableColumnIdJson, string>();
  const pFrameDriver = getPFrameDriver();
  const columns = await pFrameDriver.listColumns(pFrame);
  for (const column of columns) {
    if (sequenceColumnIds.includes(column.columnId)) {
      for (const axisSpec of column.spec.axesSpec) {
        const axisId = getAxisId(axisSpec);
        const canonicalizedAxisId = canonicalizeJson(axisId);
        if (processedAxes.has(canonicalizedAxisId)) continue;
        processedAxes.add(canonicalizedAxisId);
        const labelColumn = columns.find(
          ({ spec }) =>
            isLabelColumn(spec)
            && matchAxisId(axisId, getAxisId(spec.axesSpec[0])),
        );
        optionLabels.set(
          labelColumn
            ? canonicalizeJson({ type: 'column', id: labelColumn.columnId })
            : canonicalizeJson({ type: 'axis', id: axisId }),
          axisSpec.annotations?.['pl7.app/label'] ?? 'Unlabelled axis',
        );
      }
    }
    if (labelColumnOptionPredicate?.(column)) {
      optionLabels.set(
        canonicalizeJson({ type: 'column', id: column.columnId }),
        column.spec.annotations?.['pl7.app/label'] ?? 'Unlabelled column',
      );
    }
  }
  const options = Array.from(optionLabels).map(
    ([value, label]) => ({ label, value }),
  );
  const defaults = options
    .filter((option) => {
      const value = parseJson(option.value);
      if (value.type === 'axis') return true;

      const column = columns.find((c) => c.columnId === value.id);
      return column && isLabelColumn(column.spec);
    })
    .map((o) => o.value);
  return { options, defaults };
}

async function getSequenceRows(
  {
    pframe,
    sequenceColumnIds,
    labelColumnIds,
    linkerColumnPredicate,
    selection: rowSelectionModel,
  }: {
    pframe: PFrameHandle | undefined;
    sequenceColumnIds: PObjectId[];
    labelColumnIds: PTableColumnIdJson[];
    linkerColumnPredicate: PColumnPredicate | undefined;
    selection: PlSelectionModel | undefined;
  },
): Promise<SequenceRow[]> {
  if (!pframe || sequenceColumnIds.length === 0) return [];

  const pFrameDriver = getPFrameDriver();
  const columns = await pFrameDriver.listColumns(pframe);
  const linkerColumns = linkerColumnPredicate
    ? columns.filter((c) => linkerColumnPredicate(c))
    : [];

  const FilterColumnId = '__FILTER_COLUMN__' as PObjectId;
  const filterColumn = createRowSelectionColumn(
    FilterColumnId,
    rowSelectionModel,
  );

  const predef: CalculateTableDataRequest<PObjectId> = {
    src: {
      type: 'outer',
      primary: {
        type: 'inner',
        entries: [
          ...(
            filterColumn && filterColumn.data.length > 0
              ? [{ type: 'inlineColumn' as const, column: filterColumn }]
              : []
          ),
          ...sequenceColumnIds.map((c) => ({
            type: 'column' as const,
            column: c,
          })),
        ],
      },
      secondary: [
        ...linkerColumns.map((c) => c.columnId),
        ...labelColumnIds.map((c) => parseJson(c))
          .filter((c) => c.type === 'column')
          .map((c) => c.id),
      ].map((c) => ({
        type: 'column' as const,
        column: c,
      })),
    },
    filters: [],

    sorting: [], // @TODO: may be add sorting ?
  };

  const def = JSON.parse(JSON.stringify(predef));
  const table = await pFrameDriver.calculateTableData(pframe, def);

  const result: SequenceRow[] = [];
  // map index in spec (join result) to index in input (dropdown selection)
  const labelColumnsMap = new Map<number, number>();
  const sequenceColumnsMap = new Map<number, number>();
  for (let i = 0; i < table.length; i++) {
    const spec = table[i].spec;

    if (spec.type === 'column') {
      if (spec.id === FilterColumnId) continue;

      const sequenceIndex = sequenceColumnIds.findIndex((id) => id === spec.id);
      if (sequenceIndex !== -1) {
        sequenceColumnsMap.set(i, sequenceIndex);
        continue;
      }
    }

    const stringifiedId = stringifyPTableColumnId(
      spec.type === 'axis'
        ? {
          type: 'axis',
          id: getAxisId(spec.spec),
        } satisfies PTableColumnIdAxis
        : {
          type: 'column',
          id: spec.id,
        } satisfies PTableColumnIdColumn,
    );
    const labelIndex = labelColumnIds.findIndex((id) => id === stringifiedId);
    if (labelIndex !== -1) {
      labelColumnsMap.set(i, labelIndex);
    }
  }
  if (
    labelColumnsMap.size !== labelColumnIds.length
    || sequenceColumnsMap.size !== sequenceColumnIds.length
  ) {
    throw new Error('Some label or sequence columns are missing');
  }

  /// sort by index in input dropdowns
  const labelColumnsIndices = [...labelColumnsMap.keys()];
  labelColumnsIndices.sort((a, b) =>
    labelColumnsMap.get(a)! - labelColumnsMap.get(b)!
  );
  const sequenceColumnsIndices = [...sequenceColumnsMap.keys()];
  sequenceColumnsIndices.sort((a, b) =>
    sequenceColumnsMap.get(a)! - sequenceColumnsMap.get(b)!
  );

  const rowCount = table[0].data.data.length;
  for (let iRow = 0; iRow < rowCount; iRow++) {
    const labels = labelColumnsIndices.map((iCol) =>
      pTableValue(table[iCol].data, iRow, { na: '', absent: '' })?.toString()
    );
    const sequences = sequenceColumnsIndices.map((iCol) =>
      pTableValue(table[iCol].data, iRow, { na: '', absent: '' })?.toString()
    );

    const isValid = (s: unknown): s is string => typeof s === 'string';
    if (labels.every(isValid) && sequences.every(isValid)) {
      result.push({
        labels,
        sequence: sequences.join(''),
      });
    } else {
      console.warn(
        `skipping record at row ${iRow} because of invalid labels or sequences`,
        labels,
        sequences,
      );
    }
  }
  return result;
}
