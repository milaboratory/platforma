import type {
  PFrameHandle,
  PObjectId,
  RowSelectionModel,
  InlineColumnJoinEntry,
  ColumnJoinEntry,
  PTableSorting,
  CalculateTableDataRequest,
} from '@platforma-sdk/model';
import {
  createRowSelectionColumn,
  getRawPlatformaInstance,
  pTableValue,
} from '@platforma-sdk/model';
import type {
  SequenceRow,
} from './types';

export async function getSequenceRows(
  pframe: PFrameHandle,
  labelColumnsIds: PObjectId[],
  sequenceColumnsIds: PObjectId[],
  rowSelectionModel?: RowSelectionModel,
): Promise<SequenceRow[]> {
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
      secondary: labelColumnsIds.map((c) => ({
        type: 'column',
        column: c,
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
  const table = await getRawPlatformaInstance().pFrameDriver.calculateTableData(pframe, def);

  const result: SequenceRow[] = [];
  const labelColumnsIndices = [];
  const sequenceColumnsIndices = [];
  for (let i = 0; i < table.length; i++) {
    const spec = table[i].spec;
    if (spec.id === FilterColumnId) continue;
    if (sequenceColumnsIds.some((id) => id === spec.id)) {
      // TODO: properly order for single cell case
      sequenceColumnsIndices.push(i);
    } else if (labelColumnsIds.some((id) => id === spec.id)) {
      labelColumnsIndices.push(i);
    }
  }
  if (labelColumnsIndices.length !== labelColumnsIds.length || sequenceColumnsIndices.length !== sequenceColumnsIds.length) {
    throw new Error('Some label or sequence columns are missing');
  }

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
