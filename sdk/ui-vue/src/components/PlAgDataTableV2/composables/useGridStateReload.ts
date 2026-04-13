import { isJsonEqual } from "@milaboratories/helpers";
import type { PlDataTableGridStateCore } from "@platforma-sdk/model";
import type { GridApi } from "ag-grid-enterprise";
import { nextTick, ref, watch, type Ref, type ShallowRef, type WritableComputedRef } from "vue";
import type { PlAgDataTableV2Row } from "../../PlAgDataTable/types";
import { makePartialState } from "../utils/gridState";

export type UseGridStateReloadParameters = {
  gridApi: ShallowRef<GridApi<PlAgDataTableV2Row> | null>;
  gridState: WritableComputedRef<PlDataTableGridStateCore>;
  setInitialState: (state: PlDataTableGridStateCore) => void;
};

export type UseGridStateReloadReturn = {
  reloadKey: Ref<number>;
  /** Whether a reload is currently in progress (guard for onGridPreDestroyed) */
  isReloading: Ref<boolean>;
};

// Normalize columnVisibility for comparison: undefined and { hiddenColIds: [] } are equivalent.
function stateForReloadCompare(state: PlDataTableGridStateCore): PlDataTableGridStateCore {
  const cv = state.columnVisibility;
  const normalizedCv =
    cv === undefined || cv === null || cv.hiddenColIds.length === 0
      ? undefined
      : state.columnVisibility;
  return { ...state, columnVisibility: normalizedCv };
}

export function useGridStateReload(params: UseGridStateReloadParameters): UseGridStateReloadReturn {
  const reloadKey = ref(0);
  const isReloading = ref(false);

  watch(
    () => [params.gridApi.value, params.gridState.value] as const,
    ([gridApi, gridState]) => {
      if (gridApi === null || gridApi.isDestroyed()) return;

      const selfState = makePartialState(gridApi.getState());

      if (
        !isJsonEqual(gridState, {}) &&
        !isJsonEqual(stateForReloadCompare(gridState), stateForReloadCompare(selfState))
      ) {
        isReloading.value = true;
        params.setInitialState(gridState);
        ++reloadKey.value;
        nextTick(() => {
          isReloading.value = false;
        });
      }
    },
  );

  return {
    reloadKey,
    isReloading,
  };
}
