/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ColGroupDef, GridApi, GridOptions, GridReadyEvent, ICellRendererParams, RowSelectionOptions, ValueSetterParams } from 'ag-grid-enterprise';
import type { Component } from 'vue';
import { computed, shallowRef, watch } from 'vue';
import { AgGridTheme } from '../aggrid';
import { PlAgOverlayLoading } from '../components/PlAgDataTable';
import { PlAgOverlayNoRows } from '../components/PlAgDataTable';
import type { ColDefExtended } from './createAgGridColDef';
import type { PlAgOverlayLoadingParams } from '../lib';
import { autoSizeRowNumberColumn, createAgGridColDef, makeRowNumberColDef } from '../lib';
import { whenever } from '@vueuse/core';
import { PlAgCellFile } from '../components/PlAgCellFile';
import { PlAgChartStackedBarCell } from '../components/PlAgChartStackedBarCell';
import { PlAgChartHistogramCell } from '../components/PlAgChartHistogramCell';
import type { ImportFileHandle } from '@platforma-sdk/model';
import type { ImportProgress } from '@platforma-sdk/model';
import { PlAgCellStatusTag } from '../components/PlAgCellStatusTag';
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
  loadingOverlayType?: 'transparent' | undefined;
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

  private get columnDefs() {
    return this.#options.columnDefs ?? [];
  }

  /**
   * Set default column definition
   * @param def - column definition
   * @returns this
   */
  public setDefaultColDef(def: ColDefExtended<TData>) {
    this.#options.defaultColDef = def;
    return this;
  }

  /**
   * Show loading overlay
   * @param loading
   * @returns this
   */
  public setLoading(loading?: boolean) {
    this.#options.loading = loading;
    return this;
  }

  /**
   * Show "not ready overlay
   * @param notReady
   * @returns this
   */
  public setNotReady(notReady?: boolean) {
    this.#options.notReady = notReady;
    return this;
  }

  /**
   * Set loading overlay type
   * @param type
   * @returns this
   */
  public setLoadingOverlayType(type?: 'transparent') {
    this.#options.loadingOverlayType = type;
    return this;
  }

  /**
   * Set "not ready" text
   * @param notReadyText
   * @returns this
   */
  public setNotReadyText(notReadyText?: string) {
    this.#options.notReadyText = notReadyText;
    return this;
  }

  /**
   * Set "no rows" text when there are no rows (default is "Empty")
   * @param noRowsText
   * @returns this
   */
  public setNoRowsText(noRowsText?: string) {
    this.#options.noRowsText = noRowsText;
    return this;
  }

  /**
   * Set row selection options
   * @param rowSelection
   * @returns this
   */
  public setRowSelection(rowSelection?: RowSelectionOptions) {
    this.#options.rowSelection = rowSelection;
    return this;
  }

  /**
   * Set row data
   * @param rowData
   * @returns this
   */
  public setRowData(rowData: TData[]) {
    this.#options.rowData = rowData;
    return this;
  }

  /**
   * Set components
   * @param components
   * @returns this
   */
  public setComponents(components?: Record<string, Component>) {
    this.#options.components = components;
    return this;
  }

  /**
   * Set an option
   * @param key - option key
   * @param value - option value
   * @returns this
   */
  public setOption<K extends keyof GridOptionsExtended<TData>>(key: K, value: GridOptionsExtended<TData>[K]) {
    this.#options[key] = value;
    return this;
  }

  /**
   * Add an extended column definition
   * @param def - column definition
   * @returns this
   */
  public column<TValue = any>(def: ColDefExtended<TData, TValue>) {
    this.#options.columnDefs = [...this.columnDefs, def];
    return this;
  }

  /**
   * Show row numbers column
   * @param show - show or hide row numbers column
   * @returns this
   */
  public columnRowNumbers(show: boolean = true) {
    this.#options.rowNumbersColumn = show;
    return this;
  }

  /**
   * Add a file input column
   * @param def - column definition
   * @param cb - callback to set params for the file input cell renderer
   * @returns this
   */
  public columnFileInput<TValue = any>(
    def: ColDefExtended<TData, TValue> & {
      /**
       * Allowed file extensions (like ['fastq.gz'])
       */
      extensions?: string[];
      /**
       * The resolveProgress function is an optional input parameter for the component
       * that allows tracking the file upload progress in real-time.
       * By passing resolveProgress, you can ensure that the component
       * displays accurate progress values for each file as they upload.
       * How to use it in AgGrid
       * cellRendererParams: {
       *  resolveProgress: (cellData) => {
       *    const progresses = app.progresses;
       *    if (!cellData.value.importFileHandle) return undefined;
       *    else return progresses[cellData.value.importFileHandle];
       *  }
       * }
       */
      resolveImportProgress?: (cellData: ICellRendererParams<TData, TValue>) => ImportProgress | undefined;

      /**
       * The resolveFileHandle function is an optional input parameter for the component
       * that allows tracking the file upload progress in real-time.
       * By passing resolveFileHandle, you can ensure that the component
       * displays accurate progress values for each file as they upload.
       * How to use it in AgGrid
       * cellRendererParams: {
       *  resolveFileHandle: (cellData) => {
       *    return cellData.value.importFileHandle;
       *  }
       * }
       */
      resolveImportFileHandle?: (cellData: ICellRendererParams<TData, TValue>) => ImportFileHandle | undefined;

      setImportFileHandle?: (d: ValueSetterParams<TData, ImportFileHandle | undefined>) => void;
    }) {
    return this.column(Object.assign({
      cellRenderer: 'PlAgCellFile',
      headerComponentParams: { type: 'File' },
      cellStyle: { padding: 0 },
      valueSetter: (d: ValueSetterParams<TData, ImportFileHandle | undefined>) => {
        def.setImportFileHandle?.(d);
        return true;
      },
      cellRendererSelector: (cellData: ICellRendererParams<TData, TValue>) => {
        return {
          component: 'PlAgCellFile',
          params: {
            extensions: def.extensions,
            value: def.resolveImportFileHandle?.(cellData),
            resolveProgress: () => {
              return def.resolveImportProgress?.(cellData);
            },
          },
        };
      },
    }, def));
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
      PlAgChartStackedBarCell,
      PlAgChartHistogramCell,
      PlAgCellStatusTag,
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
