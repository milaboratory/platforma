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
  PColumnSpec,
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
import type { ListOption } from '@milaboratories/uikit';

const platforma = getRawPlatformaInstance();
const pFrameDriver = platforma.pFrameDriver;

export async function getSequenceColumnsOptions(
  pframe: PFrameHandle,
  sequenceColumnPredicate: (column: PColumnSpec) => boolean,
): Promise<ListOption<PObjectId>[]> {
  const columns = await pFrameDriver.listColumns(pframe);
  return columns
    .filter((c) => sequenceColumnPredicate(c.spec))
    .map((c) => ({
      label: c.spec.annotations?.['pl7.app/label'] ?? '',
      value: c.columnId,
    }));
}

export async function getLabelColumnsOptions(
  pframe: PFrameHandle,
  sequenceColumnsIds: PObjectId[],
  labelColumnOptionPredicate?: (column: PColumnSpec) => boolean,
): Promise<ListOption<PTableColumnIdJson>[]> {
  if (sequenceColumnsIds.length === 0) return [];

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
    const compatibleColumns = await pFrameDriver.findColumns(pframe, {
      columnFilter: {},
      compatibleWith: [...axesIds.values()],
      strictlyCompatible: false,
    });
    for (const column of compatibleColumns.hits.filter((c) => labelColumnOptionPredicate(c.spec))) {
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
  return [...labelOptions.values()];
}

export async function getDefaultLabelColumnsIds(
  pframe: PFrameHandle,
  labelColumnOptions: ListOption<PTableColumnIdJson>[],
): Promise<PTableColumnIdJson[]> {
  if (labelColumnOptions.length === 0) return [];

  const columns = await pFrameDriver.listColumns(pframe);
  return labelColumnOptions
    .filter((o) => {
      const value = parseJson(o.value);
      if (value.type === 'axis') return true;

      const column = columns.find((c) => c.columnId === value.id);
      return column && isLabelColumn(column.spec);
    })
    .map((o) => o.value);
}

export async function getSequenceRows(
  pframe: PFrameHandle,
  sequenceColumnsIds: PObjectId[],
  labelColumnsIds: PTableColumnIdJson[],
  rowSelectionModel?: RowSelectionModel,
): Promise<SequenceRow[]> {
  if (sequenceColumnsIds.length === 0) return [];

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
  /// map index in spec to index in input
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

  /// sort by index in input
  const labelColumnsIndices = [...labelColumnsMap.values()];
  labelColumnsIndices.sort((a, b) => labelColumnsMap.get(a)! - labelColumnsMap.get(b)!);
  const sequenceColumnsIndices = [...sequenceColumnsMap.values()];
  sequenceColumnsIndices.sort((a, b) => sequenceColumnsMap.get(a)! - sequenceColumnsMap.get(b)!);

  const rowCount = table[0].data.data.length;
  let key = 0;
  for (let iRow = 0; iRow < rowCount; iRow++) {
    const labels = [];
    for (const iCol of labelColumnsIndices) {
      labels.push(pTableValue(table[iCol].data, iRow, { na: '', absent: '' }));
    }
    const sequences = [];
    for (const iCol of sequenceColumnsIndices) {
      sequences.push(pTableValue(table[iCol].data, iRow, { na: '', absent: '' }));
    }

    const isValid = (s: unknown): s is string => typeof s === 'string'/* && s !== '' */;
    if (labels.every(isValid) && sequences.every(isValid)) {
      result.push({ labels, sequence: sequences.join(''), header: String(++key) });
    } else {
      console.warn(`skipping record at row ${iRow} because of invalid labels or sequences`, labels, sequences);
    }
  }
  return result;
}
