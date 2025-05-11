import type {
  PObjectId,
  PColumn,
  PColumnValues,
  PColumnValuesEntry,
  PColumnKey,
} from '@milaboratories/pl-model-common';
import {
  isPTableAbsent,
  PTableNA,
} from '@milaboratories/pl-model-common';
import type {
  RowSelectionModel,
} from './PlDataTable';

export type PlMultiSequenceAlignmentModel = {
  labelColumnsIds?: PObjectId[];
};

export function createRowSelectionColumn(
  columnId: PObjectId,
  rowSelectionModel: RowSelectionModel | undefined,
  label?: string,
  domain?: Record<string, string>,
): PColumn<PColumnValues> | undefined {
  if (!rowSelectionModel || rowSelectionModel.axesSpec.length === 0) return undefined;

  return {
    id: columnId,
    spec: {
      kind: 'PColumn',
      valueType: 'Int',
      name: 'pl7.app/table/row-selection',
      axesSpec: rowSelectionModel.axesSpec,
      ...(domain && { domain }),
      annotations: {
        'pl7.app/label': label ?? 'Selected rows',
        'pl7.app/discreteValues': '[1]',
      },
    },
    data: rowSelectionModel
      .selectedRowsKeys
      .filter((r): r is PColumnKey => !r.some((v) => isPTableAbsent(v) || v === PTableNA))
      .map((r) => ({
        key: r,
        val: 1,
      } satisfies PColumnValuesEntry)),
  } satisfies PColumn<PColumnValues>;
}
