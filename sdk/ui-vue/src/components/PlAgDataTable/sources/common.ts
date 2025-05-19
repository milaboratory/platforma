import {
  type PTableColumnSpec,
  type PTableValue,
  isLabelColumn as isLabelColumnSpec,
  isPTableAbsent,
  PTableNA,
} from '@platforma-sdk/model';
import type { ValueFormatterParams } from 'ag-grid-enterprise';
import type { PlAgDataTableRow } from '../types';

export const PTableHidden = { type: 'hidden' } as const;
export type PTableHidden = typeof PTableHidden;

export function isPTableHidden(value: PTableValue | PTableHidden): value is PTableHidden {
  return typeof value === 'object' && value !== null && value.type === 'hidden';
}

export const defaultValueFormatter = (value: ValueFormatterParams<PlAgDataTableRow, PTableValue | PTableHidden>) => {
  if (value.value === undefined) {
    return 'undefined';
  } else if (isPTableHidden(value.value)) {
    return 'loading...';
  } else if (isPTableAbsent(value.value) || value.value === PTableNA) {
    return '';
  } else {
    return value.value.toString();
  }
};

export function isLabelColumn(column: PTableColumnSpec) {
  return column.type === 'column' && isLabelColumnSpec(column.spec);
}
