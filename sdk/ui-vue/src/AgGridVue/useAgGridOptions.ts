/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ColGroupDef, GridApi, GridOptions, GridReadyEvent } from 'ag-grid-enterprise';
import { computed, shallowRef, watch } from 'vue';
import { AgGridTheme } from '../aggrid';
import PlAgOverlayLoading from '../components/PlAgDataTable/PlAgOverlayLoading.vue';
import PlAgOverlayNoRows from '../components/PlAgDataTable/PlAgOverlayNoRows.vue';
import type { ColDefExtended } from './createAgGridColDef';
import { autoSizeRowNumberColumn, createAgGridColDef, makeRowNumberColDef } from '../lib';
import { whenever } from '@vueuse/core';

interface GridOptionsExtended<TData = any> extends Omit<GridOptions<TData>, 'columnDefs'> {
  /**
   * Array of Column / Column Group definitions.
   */
  columnDefs?: (ColDefExtended<TData> | ColGroupDef<TData>)[] | null;
  /**
   * Show row numbers column
   */
  rowNumbersColumn?: boolean;
}

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
  factory: () => GridOptionsExtended<TData>,
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

    const options = Object.assign({}, def, factory());

    if (options.rowNumbersColumn) {
      options.columnDefs = [makeRowNumberColDef(), ...(options.columnDefs ?? [])];
    }

    options.columnDefs = options.columnDefs?.map((it) => createAgGridColDef(it));

    return options;
  });

  whenever(() => gridOptions.value.rowNumbersColumn, () => {
    if (gridApi.value) {
      autoSizeRowNumberColumn(gridApi.value);
    }
  });

  watch(() => gridOptions.value.loadingOverlayComponentParams, (newParams) => {
    // Hack to apply loadingOverlayComponentParams
    gridApi.value?.updateGridOptions({
      loading: !gridOptions.value.loading,
    });

    gridApi.value?.updateGridOptions({
      loading: gridOptions.value.loading,
      loadingOverlayComponentParams: newParams,
    });
  }, { deep: true });

  return { gridOptions, gridApi };
};
