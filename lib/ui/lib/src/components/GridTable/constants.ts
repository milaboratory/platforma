import type { Option } from '@/types';
import type { CellEvent, ColumnEvent } from './types';

export const RESIZE_GAP = 10;
export const MIN_COLUMN_WIDTH = 30;

export const cellEventOptions: Option<CellEvent>[] = [
  {
    text: 'Delete row',
    value: 'delete:row',
  },
  {
    text: 'Update value',
    value: 'update:value',
  },
];

export const columnEventOptions: Option<ColumnEvent>[] = [
  {
    text: 'Delete column',
    value: 'delete:column',
  },
  {
    text: 'Fit content',
    value: 'expand:column',
  },
];
