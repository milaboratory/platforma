import type {
  PFrameHandle,
  PObjectId,
  RowSelectionModel,
  InlineColumnJoinEntry,
  ColumnJoinEntry,
  PTableSorting,
  CalculateTableDataRequest,
  AxisId,
  CanonicalizedJson,
  PTableColumnIdAxis,
  PTableColumnIdColumn,
  PTableColumnIdJson,
  PColumnIdAndSpec,
  PColumnPredicate,
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
  stringifyPTableColumnId,
} from '@platforma-sdk/model';
import type {
  SequenceRow,
} from './types';
import type {
  ListOption,
} from '@milaboratories/uikit';
import type {
  MaybeRefOrGetter,
  Ref,
} from 'vue';
import {
  onWatcherCleanup,
  ref,
  toValue,
  watchEffect,
} from 'vue';

const platforma = getRawPlatformaInstance();
const pFrameDriver = platforma.pFrameDriver;

export async function getSequenceColumnsOptions(
  pframe: PFrameHandle | undefined,
  sequenceColumnPredicate: (column: PColumnIdAndSpec) => boolean,
): Promise<{
    options: ListOption<PObjectId>[];
    defaults: PObjectId[];
  }> {
  if (!pframe) return { options: [], defaults: [] };

  const columns = await pFrameDriver.listColumns(pframe);
  const options = columns
    .filter((c) => sequenceColumnPredicate(c))
    .map((c) => ({
      label: c.spec.annotations?.['pl7.app/label'] ?? '',
      value: c.columnId,
    }));
  const defaults = options.map((o) => o.value);
  return { options, defaults };
}

export async function getLabelColumnsOptions(
  pframe: PFrameHandle | undefined,
  sequenceColumnsIds: PObjectId[],
  labelColumnOptionPredicate?: (column: PColumnIdAndSpec) => boolean,
): Promise<{
    options: ListOption<PTableColumnIdJson>[];
    defaults: PTableColumnIdJson[];
  }> {
  if (!pframe || sequenceColumnsIds.length === 0) return { options: [], defaults: [] };

  const axesIds = new Map<CanonicalizedJson<AxisId>, AxisId>();
  const labelOptions = new Map<PTableColumnIdJson, ListOption<PTableColumnIdJson>>();

  const columns = await pFrameDriver.listColumns(pframe);
  for (const column of columns.filter((c) => sequenceColumnsIds.includes(c.columnId))) {
    for (const axisSpec of column.spec.axesSpec) {
      const axisId = getAxisId(axisSpec);

      const canonicalizedAxisId = canonicalizeJson(axisId);
      if (axesIds.has(canonicalizedAxisId)) continue;
      axesIds.set(canonicalizedAxisId, axisId);

      const labelColumn = columns.find((c) => isLabelColumn(c.spec) && matchAxisId(axisId, getAxisId(c.spec.axesSpec[0])));
      const option = {
        label: axisSpec.annotations?.['pl7.app/label'] ?? '',
        value: stringifyPTableColumnId(labelColumn
          ? {
            type: 'column',
            id: labelColumn.columnId,
          } satisfies PTableColumnIdColumn
          : {
            type: 'axis',
            id: axisId,
          } satisfies PTableColumnIdAxis),
      };

      if (labelOptions.has(option.value)) continue;
      labelOptions.set(option.value, option);
    }
  }
  if (labelColumnOptionPredicate) {
    for (const column of columns.filter((c) => labelColumnOptionPredicate(c))) {
      const option = {
        label: column.spec.annotations?.['pl7.app/label'] ?? '',
        value: stringifyPTableColumnId({
          type: 'column',
          id: column.columnId,
        } satisfies PTableColumnIdColumn),
      };

      if (labelOptions.has(option.value)) continue;
      labelOptions.set(option.value, option);
    }
  }

  const options = [...labelOptions.values()];
  const defaults = options
    .filter((o) => {
      const value = parseJson(o.value);
      if (value.type === 'axis') return true;

      const column = columns.find((c) => c.columnId === value.id);
      return column && isLabelColumn(column.spec);
    })
    .map((o) => o.value);
  return { options, defaults };
}

export function useColumns(
  { pframe, sequenceColumnPredicate, labelColumnOptionPredicate, loading }: {
    pframe: MaybeRefOrGetter<PFrameHandle | undefined>;
    sequenceColumnPredicate: (column: PColumnIdAndSpec) => boolean;
    labelColumnOptionPredicate?: (column: PColumnIdAndSpec) => boolean;
    loading: Ref<boolean>;
  },
) {
  const sequenceColumnsRef = ref<{
    options: ListOption<PObjectId>[];
    defaults: PObjectId[];
  }>({ options: [], defaults: [] });
  const labelColumnsRef = ref<{
    options: ListOption<PTableColumnIdJson>[];
    defaults: PTableColumnIdJson[];
  }>({ options: [], defaults: [] });

  watchEffect(async () => {
    let aborted = false;
    onWatcherCleanup(() => aborted = true);

    try {
      loading.value = true;
      const pframeVal = toValue(pframe);

      const sequenceColumns = await getSequenceColumnsOptions(pframeVal, sequenceColumnPredicate);
      if (aborted) return;

      const labelColumns = await getLabelColumnsOptions(pframeVal, sequenceColumns.defaults, labelColumnOptionPredicate);
      if (aborted) return;

      sequenceColumnsRef.value = sequenceColumns;
      labelColumnsRef.value = labelColumns;
    } catch (error) {
      console.error(error);
    } finally {
      if (!aborted) {
        loading.value = false;
      }
    }
  });

  return {
    sequenceColumnsRef: sequenceColumnsRef,
    labelColumnsRef: labelColumnsRef,
  };
}

export async function getSequenceRows(
  { pframe, sequenceColumnsIds, labelColumnsIds, linkerColumnPredicate, rowSelectionModel }: {
    pframe: PFrameHandle | undefined;
    sequenceColumnsIds: PObjectId[];
    labelColumnsIds: PTableColumnIdJson[];
    linkerColumnPredicate?: PColumnPredicate;
    rowSelectionModel?: RowSelectionModel;
  },
): Promise<SequenceRow[]> {
  if (!pframe || sequenceColumnsIds.length === 0) return [];

  const columns = await pFrameDriver.listColumns(pframe);
  const linkerColumns = linkerColumnPredicate ? columns.filter((c) => linkerColumnPredicate(c)) : [];

  const FilterColumnId = '__FILTER_COLUMN__' as PObjectId;
  const filterColumn = createRowSelectionColumn(FilterColumnId, rowSelectionModel);

  const def = JSON.parse(JSON.stringify({
    src: {
      type: 'outer',
      primary: {
        type: 'inner',
        entries: [
          ...(filterColumn && filterColumn.data.length > 0
            ? [{
              type: 'inlineColumn',
              column: filterColumn,
            } satisfies InlineColumnJoinEntry]
            : []),
          ...linkerColumns.map((c) => ({
            type: 'column',
            column: c.columnId,
          } satisfies ColumnJoinEntry<PObjectId>)),
          ...sequenceColumnsIds.map((c) => ({
            type: 'column',
            column: c,
          } satisfies ColumnJoinEntry<PObjectId>)),
        ].filter((e): e is ColumnJoinEntry<PObjectId> => e !== undefined),
      },
      secondary: labelColumnsIds
        .map((c) => parseJson(c))
        .filter((c) => c.type === 'column')
        .map((c) => ({
          type: 'column',
          column: c.id,
        } satisfies ColumnJoinEntry<PObjectId>)),
    },
    filters: [],
    sorting: sequenceColumnsIds.map((c) => ({
      column: {
        type: 'column',
        id: c,
      },
      ascending: true,
      naAndAbsentAreLeastValues: true,
    } satisfies PTableSorting)),
  } satisfies CalculateTableDataRequest<PObjectId>));
  const table = await pFrameDriver.calculateTableData(pframe, def);

  const result: SequenceRow[] = [];
  // map index in spec (join result) to index in input (dropdown selection)
  const labelColumnsMap = new Map<number, number>();
  const sequenceColumnsMap = new Map<number, number>();
  for (let i = 0; i < table.length; i++) {
    const spec = table[i].spec;

    if (spec.type === 'column') {
      if (spec.id === FilterColumnId) continue;

      const sequenceIndex = sequenceColumnsIds.findIndex((id) => id === spec.id);
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
    const labelIndex = labelColumnsIds.findIndex((id) => id === stringifiedId);
    if (labelIndex !== -1) {
      labelColumnsMap.set(i, labelIndex);
    }
  }
  if (labelColumnsMap.size !== labelColumnsIds.length || sequenceColumnsMap.size !== sequenceColumnsIds.length) {
    throw new Error('Some label or sequence columns are missing');
  }

  /// sort by index in input dropdowns
  const labelColumnsIndices = [...labelColumnsMap.keys()];
  labelColumnsIndices.sort((a, b) => labelColumnsMap.get(a)! - labelColumnsMap.get(b)!);
  const sequenceColumnsIndices = [...sequenceColumnsMap.keys()];
  sequenceColumnsIndices.sort((a, b) => sequenceColumnsMap.get(a)! - sequenceColumnsMap.get(b)!);

  const rowCount = table[0].data.data.length;
  for (let iRow = 0; iRow < rowCount; iRow++) {
    const labels = labelColumnsIndices
      .map((iCol) => pTableValue(table[iCol].data, iRow, { na: '', absent: '' }));
    const sequences = sequenceColumnsIndices
      .map((iCol) => pTableValue(table[iCol].data, iRow, { na: '', absent: '' }));

    const isValid = (s: unknown): s is string => typeof s === 'string'/* && s !== '' */;
    if (labels.every(isValid) && sequences.every(isValid)) {
      result.push({ labels, sequence: sequences.join(''), header: String(iRow) });
    } else {
      console.warn(`skipping record at row ${iRow} because of invalid labels or sequences`, labels, sequences);
    }
  }
  return result;
}

export function useSequenceRows(
  { pframe, sequenceColumnsIds, labelColumnsIds, linkerColumnPredicate, rowSelectionModel, loading }: {
    pframe: MaybeRefOrGetter<PFrameHandle | undefined>;
    sequenceColumnsIds: MaybeRefOrGetter<PObjectId[]>;
    labelColumnsIds: MaybeRefOrGetter<PTableColumnIdJson[]>;
    linkerColumnPredicate?: PColumnPredicate;
    rowSelectionModel: MaybeRefOrGetter<RowSelectionModel | undefined>;
    loading: Ref<boolean>;
  },
) {
  const sequenceRowsRef = ref<SequenceRow[]>([]);

  watchEffect(async () => {
    let aborted = false;
    onWatcherCleanup(() => aborted = true);

    try {
      loading.value = true;
      const sequenceRows = await getSequenceRows({
        pframe: toValue(pframe),
        sequenceColumnsIds: toValue(sequenceColumnsIds),
        labelColumnsIds: toValue(labelColumnsIds),
        linkerColumnPredicate,
        rowSelectionModel: toValue(rowSelectionModel),
      });
      if (aborted) return;

      sequenceRowsRef.value = sequenceRows;
    } catch (error) {
      console.error(error);
    } finally {
      if (!aborted) {
        loading.value = false;
      }
    }
  });

  return { sequenceRowsRef };
}
