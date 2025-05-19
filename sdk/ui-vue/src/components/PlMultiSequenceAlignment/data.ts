import type { ListOption } from '@milaboratories/uikit';
import type {
  AxisId,
  CalculateTableDataRequest,
  CanonicalizedJson,
  ColumnJoinEntry,
  InlineColumnJoinEntry,
  PColumnIdAndSpec,
  PColumnPredicate,
  PFrameHandle,
  PlSelectionModel,
  PObjectId,
  PTableColumnIdAxis,
  PTableColumnIdColumn,
  PTableColumnIdJson,
  PTableSorting,
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
import type { MaybeRefOrGetter } from 'vue';
import { onWatcherCleanup, ref, toValue, watchEffect } from 'vue';
import type { SequenceRow } from './types';

const getPFrameDriver = () => getRawPlatformaInstance().pFrameDriver;

export function useSequenceColumns(
  params: MaybeRefOrGetter<{
    pframe: PFrameHandle | undefined;
    sequenceColumnPredicate: (column: PColumnIdAndSpec) => boolean;
  }>,
) {
  const options = ref<ListOption<PObjectId>[]>([]);
  const defaults = ref<PObjectId[]>([]);
  const loading = ref(false);

  watchEffect(async () => {
    const { pframe, sequenceColumnPredicate } = toValue(params);

    if (!pframe) {
      options.value = [];
      defaults.value = [];
      return;
    }

    let aborted = false;
    onWatcherCleanup(() => {
      aborted = true;
    });

    try {
      loading.value = true;
      const res = await getSequenceColumnsOptions({
        pframe,
        sequenceColumnPredicate,
      });
      if (aborted) return;
      options.value = res.options;
      defaults.value = res.defaults;
    } catch (error) {
      console.error(error);
    } finally {
      loading.value = false;
    }
  });

  return { options, defaults, loading };
}

export function useLabelColumns(
  params: MaybeRefOrGetter<{
    pframe: PFrameHandle | undefined;
    sequenceColumnIds: PObjectId[];
    labelColumnOptionPredicate?: (column: PColumnIdAndSpec) => boolean;
  }>,
) {
  const options = ref<ListOption<PTableColumnIdJson>[]>([]);
  const defaults = ref<PTableColumnIdJson[]>([]);
  const loading = ref(false);

  watchEffect(async () => {
    const {
      pframe,
      sequenceColumnIds,
      labelColumnOptionPredicate,
    } = toValue(params);

    if (!pframe) {
      options.value = [];
      defaults.value = [];
      return;
    }

    let aborted = false;
    onWatcherCleanup(() => {
      aborted = true;
    });

    try {
      loading.value = true;
      const res = await getLabelColumnsOptions(
        { pframe, sequenceColumnIds, labelColumnOptionPredicate },
      );
      if (aborted) return;
      options.value = res.options;
      defaults.value = res.defaults;
    } catch (error) {
      console.error(error);
    } finally {
      loading.value = false;
    }
  });

  return { options, defaults, loading };
}

export function useSequenceRows(
  params: MaybeRefOrGetter<{
    pframe: PFrameHandle | undefined;
    sequenceColumnIds: PObjectId[];
    labelColumnIds: PTableColumnIdJson[];
    linkerColumnPredicate?: PColumnPredicate;
    selection: PlSelectionModel | undefined;
  }>,
) {
  const data = ref<SequenceRow[]>([]);
  const loading = ref(false);

  watchEffect(async () => {
    const {
      pframe,
      sequenceColumnIds,
      labelColumnIds,
      linkerColumnPredicate,
      selection,
    } = toValue(params);

    let aborted = false;
    onWatcherCleanup(() => {
      aborted = true;
    });

    try {
      loading.value = false;
      const sequenceRows = await getSequenceRows({
        pframe,
        sequenceColumnIds,
        labelColumnIds,
        linkerColumnPredicate,
        selection,
      });
      if (aborted) return;
      data.value = sequenceRows;
    } catch (error) {
      console.error(error);
    } finally {
      loading.value = false;
    }
  });

  return { data, loading };
}

async function getSequenceColumnsOptions({
  pframe,
  sequenceColumnPredicate,
}: {
  pframe: PFrameHandle;
  sequenceColumnPredicate: (column: PColumnIdAndSpec) => boolean;
}): Promise<{
    options: ListOption<PObjectId>[];
    defaults: PObjectId[];
  }> {
  const pFrameDriver = getPFrameDriver();
  const columns = await pFrameDriver.listColumns(pframe);
  const options = columns
    .filter((column) => sequenceColumnPredicate(column))
    .map((column) => ({
      label: column.spec.annotations?.['pl7.app/label'] ?? 'Unlabelled column',
      value: column.columnId,
    }));
  const defaults = options.map((o) => o.value);
  return { options, defaults };
}

async function getLabelColumnsOptions(
  {
    pframe,
    sequenceColumnIds,
    labelColumnOptionPredicate,
  }: {
    pframe: PFrameHandle;
    sequenceColumnIds: PObjectId[];
    labelColumnOptionPredicate?: (column: PColumnIdAndSpec) => boolean;
  },
): Promise<{
    options: ListOption<PTableColumnIdJson>[];
    defaults: PTableColumnIdJson[];
  }> {
  const processedAxes = new Set<CanonicalizedJson<AxisId>>();
  const optionLabels = new Map<PTableColumnIdJson, string>();
  const pFrameDriver = getPFrameDriver();
  const columns = await pFrameDriver.listColumns(pframe);
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
    linkerColumnPredicate?: PColumnPredicate;
    selection?: PlSelectionModel;
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

  const predef = {
    src: {
      type: 'outer',
      primary: {
        type: 'inner',
        entries: [
          ...(filterColumn && filterColumn.data.length > 0
            ? [
              {
                type: 'inlineColumn',
                column: filterColumn,
              } satisfies InlineColumnJoinEntry,
              ]
            : []),
          ...linkerColumns.map((c) => ({
            type: 'column',
            column: c.columnId,
          } satisfies ColumnJoinEntry<PObjectId>)),
          ...sequenceColumnIds.map((c) => ({
            type: 'column',
            column: c,
          } satisfies ColumnJoinEntry<PObjectId>)),
        ].filter((e): e is ColumnJoinEntry<PObjectId> => e !== undefined),
      },
      secondary: labelColumnIds
        .map((c) => parseJson(c))
        .filter((c) => c.type === 'column')
        .map((c) => ({
          type: 'column',
          column: c.id,
        } satisfies ColumnJoinEntry<PObjectId>)),
    },
    filters: [],
    sorting: sequenceColumnIds.map((c) => ({
      column: {
        type: 'column',
        id: c,
      },
      ascending: true,
      naAndAbsentAreLeastValues: true,
    } satisfies PTableSorting)),
  } satisfies CalculateTableDataRequest<PObjectId>;

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
    labelColumnsMap.get(a)! - labelColumnsMap.get(b)!,
  );
  const sequenceColumnsIndices = [...sequenceColumnsMap.keys()];
  sequenceColumnsIndices.sort((a, b) =>
    sequenceColumnsMap.get(a)! - sequenceColumnsMap.get(b)!,
  );

  const rowCount = table[0].data.data.length;
  for (let iRow = 0; iRow < rowCount; iRow++) {
    const labels = labelColumnsIndices.map((iCol) =>
      pTableValue(table[iCol].data, iRow, { na: '', absent: '' })?.toString(),
    );
    const sequences = sequenceColumnsIndices.map((iCol) =>
      pTableValue(table[iCol].data, iRow, { na: '', absent: '' })?.toString(),
    );

    const isValid = (s: unknown): s is string => typeof s === 'string';
    if (labels.every(isValid) && sequences.every(isValid)) {
      result.push({
        labels,
        sequence: sequences.join(''),
        header: String(iRow),
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
