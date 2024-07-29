import type { TableSettings } from './types';
import Component from './TableComponent.vue';
import type * as Types from './types';
import type { DataRow, GetPrimaryKey, Row } from './types';
import { GAP, WINDOW_DELTA } from './constants';
import { sliceBy } from './domain';
import { h } from 'vue';

export function settings<D extends Types.DataRow>(tableSettings: Readonly<TableSettings<D>>): Readonly<TableSettings> {
  return Object.freeze(tableSettings) as Readonly<TableSettings>;
}

export function factory<const S extends TableSettings>(tableSettings: S) {
  return h(Component, { settings: Object.freeze(tableSettings) });
}

export { Component };

export { Types };

const rowsStore = new WeakMap<WeakKey, Row[]>();

export class RawData<D extends DataRow = DataRow> implements Types.DataSource {
  private dataHeight: number;

  constructor(
    public readonly datum: D[],
    public readonly rowHeight: number,
    public readonly getPrimaryKey: GetPrimaryKey<D>,
  ) {
    this.dataHeight = datum.length * (this.rowHeight + GAP);
    const rows = datum.map((dataRow, index) => ({
      dataRow,
      index,
      primaryKey: this.getPrimaryKey(dataRow, index),
      offset: index * (this.rowHeight + GAP),
      height: rowHeight,
    }));
    rowsStore.set(this, rows);
  }

  get rows(): Row<D>[] {
    return rowsStore.get(this)! as Row<D>[];
  }

  async getHeight() {
    return this.dataHeight;
  }

  async getRows(scrollTop: number, bodyHeight: number): Promise<Row<D>[]> {
    return sliceBy(this.rows, (_it, i) => {
      const offset = i * (this.rowHeight + GAP);
      return scrollTop < offset + this.rowHeight + WINDOW_DELTA && offset < bodyHeight + scrollTop + WINDOW_DELTA;
    });
  }
}

export class AsyncData<D extends DataRow> implements Types.DataSource {
  constructor(
    public readonly api: Types.ExternalApi<D>,
    public readonly rowHeight: number,
    public readonly getPrimaryKey: Types.GetPrimaryKey,
  ) {}

  get height() {
    return this.rowHeight + GAP;
  }

  async getHeight(): Promise<number> {
    return (await this.api.count()) * this.height;
  }

  async getRows(scrollTop: number, bodyHeight: number): Promise<Row[]> {
    const offset = Math.floor(scrollTop / this.height);
    const limit = Math.ceil(bodyHeight + 40 / this.height); // @TODO safe window
    const rows = await this.api.query({ offset, limit });
    return rows.map<Types.Row>((dataRow, index) => ({
      dataRow,
      index: offset + index,
      primaryKey: this.getPrimaryKey(dataRow, offset + index),
      offset: (offset + index) * (this.rowHeight + GAP),
      height: this.rowHeight,
    }));
  }
}
