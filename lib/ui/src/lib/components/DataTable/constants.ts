import type { IOption } from '@/lib/types';
import type { CellEvent, ColumnEvent } from './types';

export const RESIZE_GAP = 10;

export const MIN_COLUMN_WIDTH = 30;

export const DEFAULT_ROW_HEIGHT = 40;

export const cellEventOptions: IOption<CellEvent>[] = [
  {
    text: 'Delete row',
    value: 'delete:row',
  },
  {
    text: 'Select row',
    value: 'select:row',
  },
  {
    text: 'Update value',
    value: 'update:value',
  },
];

export const columnEventOptions: IOption<ColumnEvent>[] = [
  {
    text: 'Delete column',
    value: 'delete:column',
  },
  {
    text: 'Fit content',
    value: 'expand:column',
  },
];
