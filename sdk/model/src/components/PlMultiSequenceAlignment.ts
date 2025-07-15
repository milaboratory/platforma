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

export interface PlMultiSequenceAlignmentSettings {
  sequenceColumnIds?: PObjectId[];
  labelColumnIds?: PTableColumnId[];
  colorScheme: PlMultiSequenceAlignmentColorSchemeOption;
  widgets: ('consensus' | 'seqLogo' | 'legend')[];
  alignmentParams: {
    gpo: number;
    gpe: number;
    tgpe: number;
  };
}

export interface PlMultiSequenceAlignmentModel
  extends Partial<PlMultiSequenceAlignmentSettings> {
  version?: number;
}

export type PlMultiSequenceAlignmentColorSchemeOption =
  | { type: 'no-color' }
  | { type: 'chemical-properties' }
  | { type: 'markup'; columnId: PObjectId };

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
