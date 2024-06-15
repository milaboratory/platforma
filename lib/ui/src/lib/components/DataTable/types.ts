import { sliceBy } from '@milaboratory/helpers/collections';
import type { Component } from 'vue';
import type { h } from 'vue';
import { GAP } from './constants';

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
  columns: readonly ColumnSettings[];
  rows: readonly RowSettings[];
  resize: boolean;
  resizeTh?: ResizeTh;
  dataHeight: number;
  bodyHeight: number;
  bodyWidth: number;
  scrollTop: number;
  scrollLeft: number;
  selectedRows: Set<string>;
  selectedColumns: Set<string>;
};

export type DataRow = Record<string, unknown>;

// Table settings
export type TableSettings = {
  columns: ColumnSettings[];
  //datum: DataRow[]; // @TODO common inteface
  dataSource: DataSource;
  getPrimaryKey: (row: DataRow, index: number) => string;
  gap?: number;
  addColumn?: () => Promise<void>;
  controlColumn?: boolean;

  onDeleteRows?: (primaryIds: string[]) => void;
  onDeleteColumns?: (columnIds: string[]) => void;
  onEdit?: (ev: { rowId: string; columnId: string; value: unknown }) => boolean;
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
  render?: (_h: typeof h, value: unknown) => Component;
  editable?: boolean;
  valueType?: ValueType;
  frozen?: boolean;
};

export type ResizeTh = {
  colId: string;
  width: number;
  x: number;
  right: number;
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

export type RowSettings = {
  dataRow: DataRow;
  index: number;
  offset: number;
  height: number;
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

export interface DataSource {
  getHeight(): Promise<number>;
  getRows(scrollTop: number, bodyHeight: number): Promise<RowSettings[]>;
}

export class RawData implements DataSource {
  private rows: RowSettings[];

  constructor(
    private datum: DataRow[],
    private rowHeight: number,
  ) {
    this.rows = this.datum.map((dataRow, index) => ({
      dataRow,
      index,
      offset: index * (this.rowHeight + GAP),
      height: rowHeight,
    }));
  }

  async getHeight() {
    return this.datum.length * (this.rowHeight + GAP);
  }

  async getRows(scrollTop: number, bodyHeight: number): Promise<RowSettings[]> {
    return sliceBy(this.rows, (_it, i) => {
      const offset = i * (this.rowHeight + GAP);
      return scrollTop < offset + this.rowHeight && offset < bodyHeight + scrollTop;
    });
  }
}

export type ExternalApi<T extends DataRow> = {
  query(options: { offset: number; limit: number }): Promise<T[]>;
  count(): Promise<number>;
};

export class AsyncData<T extends DataRow> implements DataSource {
  constructor(
    private api: ExternalApi<T>,
    private rowHeight: number,
  ) {}

  get height() {
    return this.rowHeight + GAP;
  }

  async getHeight(): Promise<number> {
    return (await this.api.count()) * this.height;
  }

  async getRows(scrollTop: number, bodyHeight: number): Promise<RowSettings[]> {
    const offset = Math.floor(scrollTop / this.height);
    const limit = Math.ceil(bodyHeight + 40 / this.height); // @TODO safe window
    const rows = await this.api.query({ offset, limit });
    return rows.map<RowSettings>((dataRow, index) => ({
      dataRow,
      index: offset + index,
      offset: (offset + index) * (this.rowHeight + GAP),
      height: this.rowHeight,
    }));
  }
}
