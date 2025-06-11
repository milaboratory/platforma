import {
  isPTableAbsent,
  type PColumn,
  type PColumnIdAndSpec,
  type PColumnKey,
  type PColumnValues,
  type PObjectId,
  type PTableColumnId,
  uniquePlId,
} from '@milaboratories/pl-model-common';
import { type PlSelectionModel } from './PlSelectionModel';

export type PColumnPredicate = (column: PColumnIdAndSpec) => boolean;

export type PlMultiSequenceAlignmentModel = {
  version?: number;
  sequenceColumnIds?: PObjectId[];
  labelColumnIds?: PTableColumnId[];
};

export function createRowSelectionColumn({
  selection,
  columnId = uniquePlId() as string as PObjectId,
  label = 'Selection marker',
  domain,
}: {
  selection: PlSelectionModel | undefined;
  columnId?: PObjectId;
  label?: string;
  domain?: Record<string, string>;
}): PColumn<PColumnValues> | undefined {
  if (!selection?.axesSpec.length) {
    return;
  }
  const data: PColumnValues = selection.selectedKeys
    .filter((r): r is PColumnKey => r.every((v) => !isPTableAbsent(v)))
    .map((r) => ({ key: r, val: 1 }));
  if (!data.length) {
    return;
  }
  return {
    id: columnId,
    spec: {
      kind: 'PColumn',
      valueType: 'Int',
      name: 'pl7.app/table/row-selection',
      axesSpec: selection.axesSpec,
      ...(domain && Object.keys(domain).length && { domain }),
      annotations: {
        'pl7.app/label': label,
        'pl7.app/discreteValues': '[1]',
      },
    },
    data,
  };
}
