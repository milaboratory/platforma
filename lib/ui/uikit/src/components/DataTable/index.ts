import type { TableSettings } from './types';
import Component from './TableComponent.vue';
import type * as Types from './types';
import type { RawTableSettings } from './types';
import type { ComputedRef } from 'vue';
import { computed, h, reactive, unref } from 'vue';
import { RawData } from './adapters/RawData';
import type { MaybeRef } from '../../types';
export { AsyncData } from './adapters/AsyncData';

type AnyRef<T> = MaybeRef<T> | ComputedRef<T>;

export function settings<D extends Types.DataRow>(tableSettings: TableSettings<D>): TableSettings {
  return Object.freeze(tableSettings) as TableSettings;
}

export function factory<const S extends TableSettings>(tableSettings: S) {
  return h(Component, { settings: Object.freeze(tableSettings) });
}

export { Component };

export { Types };

/** * Adapters ***/

export function rawDataSettings<D extends Types.DataRow>(rows: D[], rawSettings: Types.RawTableSettings<D>): TableSettings {
  const dataSource = new RawData<D>(rows, rawSettings.resolveRowHeight, rawSettings.resolvePrimaryKey);
  return { ...rawSettings, dataSource } as TableSettings;
}

export function useRawData<D extends Types.DataRow>(rowsRef: AnyRef<D[]>, raw: MaybeRef<RawTableSettings<D>>) {
  return computed(() => {
    const rows = unref(rowsRef);
    return rawDataSettings(rows, unref(raw));
  });
}

/**
 * @deprecated
 * @param rows
 * @param raw
 * @returns
 */
export function useRawDataComponent<D extends Types.DataRow>(rowsRef: AnyRef<D[]>, raw: MaybeRef<RawTableSettings<D>>) {
  const settings = computed(() => {
    const rows = unref(rowsRef);
    return rawDataSettings(rows, unref(raw));
  });

  const props = reactive({
    settings,
  });

  return computed(() => h(Component, props));
}
