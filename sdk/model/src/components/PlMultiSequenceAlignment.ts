import type {
  CanonicalizedJson,
  PColumn,
  PColumnIdAndSpec,
  PColumnKey,
  PColumnValues,
  PColumnValuesEntry,
  PObjectId,
  PTableColumnId,
} from '@milaboratories/pl-model-common';
import {
  canonicalizeJson,
  isPTableAbsent,
} from '@milaboratories/pl-model-common';
import type { PlSelectionModel } from './PlSelectionModel';

/** Canonicalized PTableColumnId JSON string */
export type PTableColumnIdJson = CanonicalizedJson<PTableColumnId>;

/** Encode `PTableColumnId` as canonicalized JSON string */
export function stringifyPTableColumnId(
  id: PTableColumnId,
): PTableColumnIdJson {
  const type = id.type;
  switch (type) {
    case 'axis':
      return canonicalizeJson(id);
    case 'column':
      return canonicalizeJson(id);
    default:
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw Error(`unsupported column type: ${type satisfies never}`);
  }
}

export type PColumnPredicate = (column: PColumnIdAndSpec) => boolean;

export type PlMultiSequenceAlignmentModel = {
  sequenceColumnIds?: PObjectId[];
  labelColumnIds?: PTableColumnIdJson[];
};

export function createRowSelectionColumn(
  columnId: PObjectId,
  rowSelectionModel: PlSelectionModel | undefined,
  label?: string,
  domain?: Record<string, string>,
): PColumn<PColumnValues> | undefined {
  if (!rowSelectionModel || rowSelectionModel.axesSpec.length === 0) {
    return undefined;
  }

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
      .selectedKeys
      .filter((r): r is PColumnKey => !r.some((v) => isPTableAbsent(v)))
      .map((r) => ({ key: r, val: 1 } satisfies PColumnValuesEntry)),
  } satisfies PColumn<PColumnValues>;
}
