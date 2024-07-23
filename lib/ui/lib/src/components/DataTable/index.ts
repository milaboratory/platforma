import type { TableSettings } from './types';
import Component from './TableComponent.vue';
import type * as Types from './types';
import { GAP, WINDOW_DELTA } from './constants';
import { sliceBy } from './domain';

export function settings<const S extends TableSettings>(settings: S) {
  return Object.freeze(settings);
}

export { Component };

export { Types };

const rowsStore = new WeakMap<RawData, Types.RowSettings[]>();

export class RawData implements Types.DataSource {
  private dataHeight: number;

  constructor(
    datum: Types.DataRow[],
    private rowHeight: number,
  ) {
    this.dataHeight = datum.length * (this.rowHeight + GAP);
    const rows = datum.map((dataRow, index) => ({
      dataRow,
      index,
      offset: index * (this.rowHeight + GAP),
      height: rowHeight,
    }));
    rowsStore.set(this, rows);
  }

  get rows() {
    return rowsStore.get(this)!;
  }

  async getHeight() {
    return this.dataHeight;
  }

  async getRows(scrollTop: number, bodyHeight: number): Promise<Types.RowSettings[]> {
    return sliceBy(this.rows, (_it, i) => {
      const offset = i * (this.rowHeight + GAP);
      return scrollTop < offset + this.rowHeight + WINDOW_DELTA && offset < bodyHeight + scrollTop + WINDOW_DELTA;
    });
  }
}

export class AsyncData<T extends Types.DataRow> implements Types.DataSource {
  constructor(
    private api: Types.ExternalApi<T>,
    private rowHeight: number,
  ) {}

  get height() {
    return this.rowHeight + GAP;
  }

  async getHeight(): Promise<number> {
    return (await this.api.count()) * this.height;
  }

  async getRows(scrollTop: number, bodyHeight: number): Promise<Types.RowSettings[]> {
    const offset = Math.floor(scrollTop / this.height);
    const limit = Math.ceil(bodyHeight + 40 / this.height); // @TODO safe window
    const rows = await this.api.query({ offset, limit });
    return rows.map<Types.RowSettings>((dataRow, index) => ({
      dataRow,
      index: offset + index,
      offset: (offset + index) * (this.rowHeight + GAP),
      height: this.rowHeight,
    }));
  }
}
