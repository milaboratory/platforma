import type { GridApi, GridOptions, GridReadyEvent } from 'ag-grid-enterprise';
import { computed, shallowRef, watch } from 'vue';
import { AgGridTheme } from '../aggrid';
import PlAgOverlayLoading from '../components/PlAgDataTable/PlAgOverlayLoading.vue';
import PlAgOverlayNoRows from '../components/PlAgDataTable/PlAgOverlayNoRows.vue';
import { autoSizeRowNumberColumn } from '../lib';

/**
 * Returns a set of Ag Grid options along with a reference to the Ag Grid API.
 * (This is a fast prototype)
 *
 * @example
 * ```ts
 * const { gridOptions, gridApi } = useAgDataTableOptionsSimple(() => ({
 *   // custom grid options here
 * }));
 *
 * // Usage in a template (v-bind is required!)
 * <template>
 *   <AgGridVue :style="{ height: '100%' }" v-bind="gridOptions" />
 * </template>
 * ```
 */
export function useAgGridOptionsSimple<TData>(
  factory: () => GridOptions<TData>,
) {
  const gridApi = shallowRef<GridApi>();

  const gridOptions = computed<GridOptions>(() => {
    const def: GridOptions<TData> = {
      theme: AgGridTheme,
      loadingOverlayComponent: PlAgOverlayLoading,
      noRowsOverlayComponent: PlAgOverlayNoRows,
      onGridReady: (e: GridReadyEvent) => {
        gridApi.value = e.api;
        autoSizeRowNumberColumn(e.api);
      },
    };

    return Object.assign({}, def, factory());
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
