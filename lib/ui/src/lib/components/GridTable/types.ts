type TypeMap = {
  integer: number;
  float: number;
  string: string;
  unknown: number | string;
};

export type ValueType = keyof TypeMap;

export type ColumnSettings = {
  text: string;
  name: string;
  width?: string;
  justify?: 'center' | 'start';
  sort?: {
    direction: 'DESC' | 'ASC' | undefined;
  };
  slot?: boolean;
  editable?: boolean;
  valueType?: ValueType;
};

export type Settings = {
  columns: ColumnSettings[];
  rows: Record<string, unknown>[];
  addColumn?: () => Promise<void>;
  autoLastColumn?: boolean;
  selfSort?: boolean;
};

export type CellProps = {
  colName: string;
  rowIndex: number;
  value: unknown;
  class: string;
  editable?: boolean;
};

export type Data = {
  rowIndex: number;
  columnsMeta: Record<number, { width: number }>;
  resize: boolean;
  resizeTh:
    | {
        index: number;
        width: number;
        x: number;
        right: number;
      }
    | undefined;
};
