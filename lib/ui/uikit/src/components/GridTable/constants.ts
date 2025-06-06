import type { ListOption } from '../../types';
import type { CellEvent, ColumnEvent } from './types';

export const RESIZE_GAP = 10;
export const MIN_COLUMN_WIDTH = 30;

export const cellEventOptions: ListOption<CellEvent>[] = [
  {
    text: 'Delete row',
    value: 'delete:row',
  },
  {
    text: 'Update value',
    value: 'update:value',
  },
];

export const columnEventOptions: ListOption<ColumnEvent>[] = [
  {
    text: 'Delete column',
    value: 'delete:column',
  },
  {
    text: 'Fit content',
    value: 'expand:column',
  },
];
