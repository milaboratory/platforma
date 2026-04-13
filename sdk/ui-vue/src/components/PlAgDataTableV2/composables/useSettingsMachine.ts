import { shallowRef, watch } from "vue";
import type { Ref, ShallowRef } from "vue";
import type { GridApi, ManagedGridOptions } from "ag-grid-enterprise";
import type { PlDataTableModel, PlDataTableSheet, PlTableColumnIdJson } from "@platforma-sdk/model";
import { isAbortError } from "@platforma-sdk/model";
import { isJsonEqual } from "@milaboratories/helpers";
import type { PlAgDataTableV2Row, PlDataTableSettingsV2 } from "../../PlAgDataTable/types";
import type {
  SettingsState,
  OverlayVariant,
  CellButtonAxisParameters,
  ColumnPipelineResult,
} from "../types";
import { DeferredCircular } from "../../PlAgDataTable/sources/focus-row";

export type UseSettingsMachineParameters = {
  settings: Ref<PlDataTableSettingsV2>;
  gridApi: ShallowRef<GridApi<PlAgDataTableV2Row> | null>;
  dataRenderedTracker: DeferredCircular<GridApi<PlAgDataTableV2Row>>;
  showLoading: (variant: OverlayVariant) => void;
  hideLoading: () => void;
  updateOptions: (partial: Partial<ManagedGridOptions<PlAgDataTableV2Row>>) => void;
  clearSelection: () => void;
  runColumnPipeline: (options: {
    model: PlDataTableModel;
    sheets: PlDataTableSheet[];
    hiddenColIds: PlTableColumnIdJson[] | undefined;
    cellButtonAxisParams?: CellButtonAxisParameters;
    signal: AbortSignal;
    onDataRendered: (api: GridApi<PlAgDataTableV2Row>) => void;
  }) => Promise<ColumnPipelineResult>;
  onPipelineComplete: (result: ColumnPipelineResult) => void;
  onPipelineError: (error: unknown) => void;
  onNewDataRendered: () => void;
  getHiddenColIds: () => PlTableColumnIdJson[] | undefined;
  getCellButtonAxisParameters: () => CellButtonAxisParameters | undefined;
};

type UseSettingsMachineReturn = {
  state: ShallowRef<SettingsState>;
  /** Call to dispose the AbortController on component unmount */
  dispose: () => void;
};

export function useSettingsMachine(params: UseSettingsMachineParameters): UseSettingsMachineReturn {
  const {
    settings,
    gridApi,
    dataRenderedTracker,
    showLoading,
    hideLoading,
    updateOptions,
    clearSelection,
    runColumnPipeline,
    onPipelineComplete,
    onPipelineError,
    onNewDataRendered,
    getHiddenColIds,
    getCellButtonAxisParameters,
  } = params;

  const state = shallowRef<SettingsState>({ kind: "no-source", pending: false });
  let abortController = new AbortController();
  let oldSettings: PlDataTableSettingsV2 | null = null;

  watch(
    () => [gridApi.value, settings.value] as const,
    ([api, newSettings]) => {
      // Wait for AgGrid initialization; gridApi will eventually become non-null
      if (api === null || api.isDestroyed()) return;
      // Skip false watch triggers where settings haven't actually changed
      if (isJsonEqual(newSettings, oldSettings)) return;

      // Abort all in-flight operations from the previous transition
      abortController.abort();
      abortController = new AbortController();

      // Reset the shared data-rendered tracker for this transition
      dataRenderedTracker.reset();

      try {
        // Hide any active no-rows overlay so loading overlay can be shown
        api.hideOverlay();

        // ── State 1: no-source ─────────────────────────────────────────
        if (newSettings.sourceId === null) {
          state.value = { kind: "no-source", pending: newSettings.pending };
          showLoading(newSettings.pending ? "running" : "not-ready");
          updateOptions({ columnDefs: undefined, serverSideDatasource: undefined });
          clearSelection();
          return;
        }

        // ── State 2: source-changed ────────────────────────────────────
        if (newSettings.sourceId !== oldSettings?.sourceId) {
          state.value = { kind: "source-changed", sourceId: newSettings.sourceId };
          showLoading("loading");
          if (oldSettings !== null && oldSettings.sourceId !== null) {
            clearSelection();
          }
        }

        // ── State 3: model-pending ─────────────────────────────────────
        const modelSourceId = newSettings.model?.sourceId;
        const modelBelongsToOldRun =
          modelSourceId !== undefined &&
          modelSourceId !== null &&
          modelSourceId !== newSettings.sourceId;

        if (newSettings.model === undefined || modelBelongsToOldRun) {
          state.value = { kind: "model-pending", sourceId: newSettings.sourceId };

          // Preserve existing row count when the source hasn't changed,
          // otherwise default to 1 row for skeleton display
          const groupLevelState = api.getServerSideGroupLevelState();
          const rowCount =
            !modelBelongsToOldRun && groupLevelState.length > 0 ? groupLevelState[0].rowCount : 1;

          updateOptions({
            serverSideDatasource: {
              getRows: (rowParams) => {
                rowParams.success({ rowData: [], rowCount });
              },
            },
          });
          return;
        }

        // ── State 4: model-ready ───────────────────────────────────────
        state.value = { kind: "model-ready", sourceId: newSettings.sourceId };
        const signal = abortController.signal;

        runColumnPipeline({
          model: newSettings.model,
          sheets: newSettings.sheets ?? [],
          hiddenColIds: getHiddenColIds(),
          cellButtonAxisParams: getCellButtonAxisParameters(),
          signal,
          onDataRendered: (renderedApi) => {
            dataRenderedTracker.resolve(renderedApi);
          },
        })
          .then((result) => {
            if (signal.aborted || gridApi.value === null || gridApi.value.isDestroyed()) return;
            onPipelineComplete(result);
          })
          .catch((error: unknown) => {
            if (signal.aborted || gridApi.value === null || gridApi.value.isDestroyed()) return;
            if (isAbortError(error)) return;
            onPipelineError(error);
          })
          .finally(() => {
            if (signal.aborted || gridApi.value === null || gridApi.value.isDestroyed()) return;
            hideLoading();
          });

        dataRenderedTracker.promise.then(() => {
          if (signal.aborted) return;
          onNewDataRendered();
        });
      } finally {
        oldSettings = newSettings;
      }
    },
  );

  function dispose(): void {
    abortController.abort();
  }

  return {
    state,
    dispose,
  };
}
