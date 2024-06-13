type TypeMap = {
  integer: number;
  float: number;
  string: string;
  unknown: number | string;
};

export type ValueType = keyof TypeMap;

// Data table props
export type TableProps = {
  settings: Settings;
};

// Inner table state
export type TableData = {
  rowIndex: number;
  columns: readonly ColumnSettings[];
  resize: boolean;
  resizeTh?: ResizeTh;
  bodyHeight: number;
  bodyWidth: number;
  scrollTop: number;
  scrollLeft: number;
  selectedRows: Set<string>;
};

type DataRow = Record<string, unknown>;

// Table settings
export type Settings = {
  columns: ColumnSettings[];
  datum: DataRow[]; // @TODO common inteface
  getPrimaryKey: (row: DataRow, index: number) => string;
  operations?: {
    onDelete?: (primaryIds: string[]) => void;
  };
  rowHeight?: number;
  gap?: number;
  addColumn?: () => Promise<void>;
  autoLastColumn?: boolean;
  selfSort?: boolean;
  columnEvents?: ColumnEvent[];
  cellEvents?: CellEvent[];
  editable?: boolean;
  controlColumn?: boolean;
};

export type ColumnSettings = {
  label: string;
  id: string;
  width: number;
  justify?: 'center' | 'start';
  sort?: {
    direction: 'DESC' | 'ASC' | undefined;
  };
  slot?: boolean;
  editable?: boolean;
  valueType?: ValueType;
  frozen?: boolean;
};

export type ColumnEvent = 'delete:column' | 'expand:column';

export type CellEvent = 'delete:row' | 'update:value' | 'select:row';

export type ResizeTh = {
  colId: string;
  width: number;
  x: number;
  right: number;
};

export type RowSettings = {
  dataRow: DataRow;
  index: number;
  offset: number;
  height: number;
};

export type CellProps = {
  column: ColumnSettings;
  dataRow: DataRow;
  primaryKey: string;
  rowIndex: number;
  value: unknown;
  class: string;
  editable?: boolean;
  slot?: boolean;
  width: number;
  style: ColumnStyle;
  control?: boolean;
};

export type TableRow = {
  style: Record<string, string>;
  offset: number;
  height: number;
  cells: CellProps[];
  primaryKey: string;
  selected?: boolean;
};
export type ColumnStyle = {
  left: string;
  width: string;
};

export type TableColumn = ColumnSettings & {
  style: ColumnStyle;
  offset: number;
  control?: boolean;
};
