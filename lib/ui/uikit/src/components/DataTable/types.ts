import type { Component } from 'vue';
import type { Branded, Equal, Expect, Values } from '@milaboratories/helpers';

type TypeMap = {
  integer: number;
  float: number;
  string: string;
  unknown: number | string;
};

export type ValueType = keyof TypeMap;

// Data table props
export type TableProps = {
  settings: TableSettings;
};

export type DataWindow = {
  bodyHeight: number;
  scrollTop: number;
};

// Inner table state
export type TableData = {
  rowIndex: number;
  pendingLoads: number;
  columns: readonly ColumnSpecSettings[];
  rows: readonly Row[];
  currentWindow?: DataWindow;
  resize: boolean;
  resizeTh?: ResizeTh;
  dataHeight: number;
  bodyHeight: number;
  bodyWidth: number;
  scrollTop: number;
  scrollLeft: number;
  selectedRows: Set<PrimaryKey>;
  selectedColumns: Set<string>;

  error?: unknown;
};

export type DataRow = Record<string, unknown>;

export type PrimaryKey = Branded<string, 'PrimaryKey'>;

export type ResolvePrimaryKey<D extends DataRow = DataRow> = (dataRow: D, index: number) => string;

export type ResolveRowHeight<D extends DataRow = DataRow> = (dataRow: D, index: number) => number;

export type SelectedRowsOperation<D extends DataRow = DataRow> = {
  label: string;
  cb: (rows: Row<D>[]) => Promise<void>;
};

export type SelectedColumnsOperation<D extends DataRow = DataRow> = {
  label: string;
  cb: (columns: ColumnSpec<D>[]) => Promise<void>;
};

export type TableSettings<D extends DataRow = DataRow> = Readonly<{
  columns: ColumnSpec<D>[];
  dataSource: DataSource<D>;
  gap?: number;
  height: number;
  addColumn?: () => Promise<void>;
  controlColumn?: boolean;
  onSelectedRows?: SelectedRowsOperation<D>[];
  onSelectedColumns?: SelectedColumnsOperation<D>[];

  onUpdatedRow?: (row: Row<D>) => void;
}>;

export type ColumnSpecSettings<ID = string, _Value = unknown> = {
  label: string;
  id: ID;
  width: number;
  justify?: 'center' | 'start';
  sort?: {
    direction: 'DESC' | 'ASC' | undefined;
  };
  component?: () => Component;
  editable?: boolean;
  valueType?: ValueType;
  frozen?: boolean;
};

export type ColumnSpec<D extends DataRow = DataRow> = Values<{
  [P in keyof D]: ColumnSpecSettings<P, D[P]>;
}>;

export type TableCell<D extends DataRow = DataRow> = Values<{
  [P in keyof D]: {
    id: P;
    column: ColumnSpecSettings<P, D[P]>;
    row: Row<D>;
    value: D[P];
    class: string;
    editable?: boolean;
    width: number;
    style: ColumnStyle;
    control?: boolean;
  };
}>;

export type Row<D extends DataRow = DataRow> = {
  dataRow: D;
  index: number;
  primaryKey: PrimaryKey;
  offset: number;
  height: number;
};

export type TableRow = {
  style: {
    top: `${number}px`;
    height: `${number}px`;
  };
  offset: number;
  height: number;
  cells: TableCell[];
  primaryKey: PrimaryKey;
  selected?: boolean;
};

export type ColumnStyle = {
  left: string;
  width: string;
};

export type TableColumn = ColumnSpecSettings & {
  style: ColumnStyle;
  offset: number;
  control?: boolean;
};

export interface DataSource<D extends DataRow = DataRow> {
  getHeight(): Promise<number>;
  getRows(scrollTop: number, bodyHeight: number): Promise<Row<D>[]>;
}

export type ExternalApi<T extends DataRow> = {
  query(options: { offset: number; limit: number }): Promise<T[]>;
  count(): Promise<number>;
};

export type ResizeTh = {
  colId: string;
  width: number;
  x: number;
  right: number;
};

/*** Adapters ***/

export type RawTableSettings<D extends DataRow = DataRow> = Readonly<{
  columns: ColumnSpec<D>[];
  gap?: number;
  height: number;
  addColumn?: () => Promise<void>;
  controlColumn?: boolean;
  onSelectedRows?: SelectedRowsOperation<D>[];
  onSelectedColumns?: SelectedColumnsOperation<D>[];
  resolvePrimaryKey: ResolvePrimaryKey<D>;
  resolveRowHeight: ResolveRowHeight<D>;

  onUpdatedRow?: (row: Row<D>) => void;
}>;

/*** Static tests  ***/

type _cell = TableCell<{ age: number; name: string; payload: unknown }>;

type _age = Extract<_cell, { id: 'age' }>;

type _cases = [
  Expect<Equal<number, Extract<_cell, { id: 'age' }>['value']>>,
  Expect<Equal<string, Extract<_cell, { id: 'name' }>['value']>>,
  Expect<Equal<unknown, Extract<_cell, { id: 'payload' }>['value']>>,
  Expect<Equal<_age['column']['id'], 'age'>>,
];
