import type { Component } from 'vue';
import type { h } from 'vue';
import type { Branded, Values } from '@milaboratory/helpers/types';

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

// Inner table state
export type TableData = {
  rowIndex: number;
  loading: boolean;
  columns: readonly ColumnSpec[];
  rows: readonly Row[];
  resize: boolean;
  resizeTh?: ResizeTh;
  dataHeight: number;
  bodyHeight: number;
  bodyWidth: number;
  scrollTop: number;
  scrollLeft: number;
  selectedRows: Set<PrimaryKey>;
  selectedColumns: Set<string>;
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
  cb: (columns: ColumnSpecForData<D>[]) => Promise<void>;
};

// Table settings
export type TableSettings<D extends DataRow = DataRow> = {
  columns: ColumnSpecForData<D>[];
  dataSource: DataSource<D>;
  gap?: number;
  height: number;
  addColumn?: () => Promise<void>;
  controlColumn?: boolean;
  onSelectedRows?: SelectedRowsOperation<D>[];
  onSelectedColumns?: SelectedColumnsOperation<D>[];

  onEditValue?: (cell: TableCell<D>, value: unknown) => boolean;
};

export type RawTableSettings<D extends DataRow = DataRow> = {
  columns: ColumnSpecForData<D>[];
  gap?: number;
  height: number;
  addColumn?: () => Promise<void>;
  controlColumn?: boolean;
  onSelectedRows?: SelectedRowsOperation<D>[];
  onSelectedColumns?: SelectedColumnsOperation<D>[];
  resolvePrimaryKey: ResolvePrimaryKey<D>;
  resolveRowHeight: ResolveRowHeight<D>;

  onEditValue?: (cell: TableCell<D>, value: unknown) => boolean;
};

export type ColumnSpec<ID = string, Value = unknown> = {
  label: string;
  id: ID;
  width: number;
  justify?: 'center' | 'start';
  sort?: {
    direction: 'DESC' | 'ASC' | undefined;
  };
  render?: (_h: typeof h, value: Value) => Component;
  editable?: boolean;
  valueType?: ValueType;
  frozen?: boolean;
};

export type ColumnSpecForData<D extends DataRow> = Values<{
  [P in keyof D]: ColumnSpec<P, D[P]>;
}>;

export type TableCell<D extends DataRow = DataRow> = {
  column: ColumnSpecForData<D>;
  row: Row<D>;
  value: unknown;
  class: string;
  editable?: boolean;
  width: number;
  style: ColumnStyle;
  control?: boolean;
};

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

export type TableColumn = ColumnSpec & {
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
