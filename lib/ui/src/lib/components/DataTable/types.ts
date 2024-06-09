import type { Option } from '@/lib/types';

type TypeMap = {
  integer: number;
  float: number;
  string: string;
  unknown: number | string;
};

export type ValueType = keyof TypeMap;

export type Props = {
  settings: Settings;
};

export type ColumnSettings = {
  text: string;
  name: string;
  width: number;
  justify?: 'center' | 'start';
  sort?: {
    direction: 'DESC' | 'ASC' | undefined;
  };
  slot?: boolean;
  editable?: boolean;
  valueType?: ValueType;
};

export type ShowContextOptions = <T extends string = string>(options: Option<T>[], onSelect: (op: T) => void) => void;

export type ColumnEvent = 'delete:column' | 'expand:column';

export type CellEvent = 'delete:row' | 'update:value';

export type Settings = {
  columns: ColumnSettings[];
  datum: Record<string, unknown>[]; // @TODO columns variant
  rowHeight?: number;
  gap?: number;
  addColumn?: () => Promise<void>;
  autoLastColumn?: boolean;
  selfSort?: boolean;
  showContextOptions?: ShowContextOptions;
  columnEvents?: ColumnEvent[];
  cellEvents?: CellEvent[];
  editable?: boolean;
};

// Inner state
export type Data = {
  rowIndex: number;
  columns: readonly ColumnSettings[];
  rows: readonly RowSettings[];
  resize: boolean;
  resizeTh:
    | {
        index: number;
        width: number;
        x: number;
        right: number;
      }
    | undefined;
  bodyHeight: number;
  bodyWidth: number;
  scrollTop: number;
  scrollLeft: number;
};

export type RowSettings = {
  values: Record<string, unknown>;
  index: number;
  offset: number;
  height: number;
};

export type CellProps = {
  colName: string;
  rowIndex: number;
  value: unknown;
  class: string;
  editable?: boolean;
  slot?: boolean;
  width: number;
};

export type TableRow = {
  style: Record<string, string>;
  offset: number;
  height: number;
  cells: CellProps[];
};
