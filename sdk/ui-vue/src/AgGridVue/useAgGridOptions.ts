/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ColGroupDef, GridApi, GridOptions, GridReadyEvent } from 'ag-grid-enterprise';
import { computed, shallowRef, watch } from 'vue';
import { AgGridTheme } from '../aggrid';
import PlAgOverlayLoading from '../components/PlAgDataTable/PlAgOverlayLoading.vue';
import PlAgOverlayNoRows from '../components/PlAgDataTable/PlAgOverlayNoRows.vue';
import type { ColDefExtended } from './createAgGridColDef';
import type { PlAgOverlayLoadingParams } from '../lib';
import { autoSizeRowNumberColumn, createAgGridColDef, makeRowNumberColDef } from '../lib';
import { whenever } from '@vueuse/core';
import PlAgCellFile from '../components/PlAgCellFile/PlAgCellFile.vue';

interface GridOptionsExtended<TData = any> extends Omit<GridOptions<TData>, 'columnDefs'> {
  /**
   * Array of Column / Column Group definitions.
   */
  columnDefs?: (ColDefExtended<TData> | ColGroupDef<TData>)[] | null;
  /**
   * Show row numbers column
   */
  rowNumbersColumn?: boolean;
  /**
   * Not ready overlay (No datasource). Takes priority over "loading"
   */
  notReady?: boolean;
  /**
   * "No datasource" by default
   */
  notReadyText?: string;
  /**
   * Use "transparent" to make table headers visible below the loading layer (experimental)
   */
  loadingOverlayType?: 'transparent';
  /**
   * Override standard 'Empty' text for the "no rows" overlay
   */
  noRowsText?: string;
}

// @TODO (super simple builder for now)
class Builder<TData> {
  #options: GridOptionsExtended<TData> = {};

  public options(options: GridOptionsExtended<TData>) {
    this.#options = Object.assign({}, this.#options, options);
    return this;
  }

  get columnDefs() {
    return this.#options.columnDefs ?? [];
  }

  public column<TValue = any>(def: ColDefExtended<TData, TValue>) {
    this.#options.columnDefs = [...this.columnDefs, def];
    return this;
  }

  public build() {
    return this.#options;
  }
}

// Simple helper to use like column<string> in grid options literal
type ColumnFunc<TData> = <TValue>(def: ColDefExtended<TData, TValue>) => ColDefExtended<TData, TValue>;

/**
 * Returns a set of Ag Grid options along with a reference to the Ag Grid API.
 * (This is a fast prototype)
 *
 * @example
 * ```ts
 * const { gridOptions, gridApi } = useAgGridOptions(() => ({
 *   // custom grid options here
 * }));
 *
 * // Usage in a template (v-bind is required!)
 * <template>
 *   <AgGridVue :style="{ height: '100%' }" v-bind="gridOptions" />
 * </template>
 * ```
 */
export function useAgGridOptions<TData>(
  factory: (context: { builder: Builder<TData>; column: ColumnFunc<TData> }) => Builder<TData> | GridOptionsExtended<TData>,
) {
  const gridApi = shallowRef<GridApi>();

  const gridOptions = computed<GridOptionsExtended>(() => {
    const def: GridOptionsExtended<TData> = {
      theme: AgGridTheme,
      loadingOverlayComponent: PlAgOverlayLoading,
      noRowsOverlayComponent: PlAgOverlayNoRows,
      onGridReady: (e: GridReadyEvent) => {
        gridApi.value = e.api;
        autoSizeRowNumberColumn(e.api); // @TODO
      },
    };

    const column = <TValue>(def: ColDefExtended<TData, TValue>) => {
      return def;
    };

    const result = factory({ builder: new Builder(), column });

    const options = Object.assign({}, def, result instanceof Builder ? result.build() : result);

    if (options.rowNumbersColumn) {
      options.columnDefs = [makeRowNumberColDef(), ...(options.columnDefs ?? [])];
    }

    if (options.noRowsText) {
      options.noRowsOverlayComponentParams = {
        text: options.noRowsText,
      };
    }

    options.loading = options.notReady || options.loading;

    // @TODO
    if (options.loading) {
      options.loadingOverlayComponentParams = {
        notReady: options.notReady,
        notReadyText: options.notReadyText,
        overlayType: options.loadingOverlayType,
      } satisfies PlAgOverlayLoadingParams;
    }

    options.columnDefs = options.columnDefs?.map((it) => createAgGridColDef(it));

    // Register all special components
    options.components = Object.assign({}, options.components ?? {}, {
      PlAgCellFile,
    });

    return options;
  });

  whenever(() => gridOptions.value.rowNumbersColumn, () => {
    if (gridApi.value) {
      autoSizeRowNumberColumn(gridApi.value);
    }
  });

  watch([
    () => gridOptions.value.notReady,
    () => gridOptions.value.loading,
  ], ([notReady, loading]) => {
    const loadingOverlayComponentParams = {
      notReady,
      // we probably don't need to update the parameters below
      notReadyText: gridOptions.value.notReadyText,
      overlayType: gridOptions.value.loadingOverlayType,
    } satisfies PlAgOverlayLoadingParams;

    // Hack to apply loadingOverlayComponentParams
    gridApi.value?.updateGridOptions({
      loading: !loading,
      loadingOverlayComponentParams,
    });

    gridApi.value?.updateGridOptions({
      loading,
      loadingOverlayComponentParams,
    });
  }, { deep: true, immediate: true });

  return { gridOptions, gridApi };
};
