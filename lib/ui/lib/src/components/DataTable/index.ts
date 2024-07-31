import type { TableSettings } from './types';
import Component from './TableComponent.vue';
import type * as Types from './types';
import type { DataRow, Row, RawTableSettings } from './types';
import { GAP } from './constants';
import type { ComputedRef } from 'vue';
import { computed, h, reactive, unref } from 'vue';
import { RawData } from './adapters/RawData';
import type { MaybeRef } from '@/types';

export function settings<D extends Types.DataRow>(tableSettings: Readonly<TableSettings<D>>): Readonly<TableSettings> {
  return Object.freeze(tableSettings) as Readonly<TableSettings>;
}

export function factory<const S extends TableSettings>(tableSettings: S) {
  return h(Component, { settings: Object.freeze(tableSettings) });
}

export { Component };

export { Types };

export function fromRawData<D extends Types.DataRow>(rows: D[], rawSettings: Types.RawTableSettings<D>): Readonly<TableSettings> {
  const dataSource = new RawData<D>(rows, rawSettings.resolveRowHeight, rawSettings.resolvePrimaryKey);
  return { ...rawSettings, dataSource } as Readonly<TableSettings>;
}

export function useRawData<D extends Types.DataRow>(rows: ComputedRef<D[]>, raw: MaybeRef<RawTableSettings<D>>) {
  const settings = computed(() => {
    console.log('computed settings updated');
    return fromRawData(rows.value, unref(raw));
  });

  const props = reactive({
    settings,
  });

  // watch(
  //   props,
  //   () => {
  //     console.log('props changed');
  //   },
  //   { deep: true },
  // );

  return computed(() => h(Component, props));
}

export class AsyncData<D extends DataRow> implements Types.DataSource {
  constructor(
    public readonly api: Types.ExternalApi<D>,
    public readonly rowHeight: number,
    public readonly resolvePrimaryKey: Types.ResolvePrimaryKey,
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
      primaryKey: this.resolvePrimaryKey(dataRow, offset + index) as Types.PrimaryKey,
      offset: (offset + index) * (this.rowHeight + GAP),
      height: this.rowHeight,
    }));
  }
}
