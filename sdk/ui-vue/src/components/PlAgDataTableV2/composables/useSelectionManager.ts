import { isJsonEqual, promiseTimeout } from "@milaboratories/helpers";
import {
  canonicalizeJson,
  createPlSelectionModel,
  parseJson,
  type AxesSpec,
  type AxisId,
  type PlSelectionModel,
  type PTableKey,
} from "@platforma-sdk/model";
import type { GridApi, SelectionChangedEvent } from "ag-grid-enterprise";
import { effectScope, watch, type Ref, type ShallowRef } from "vue";
import type { PlAgDataTableV2Row, PlTableRowId, PlTableRowIdJson } from "../../PlAgDataTable/types";
import { DeferredCircular } from "../../PlAgDataTable/sources/focus-row";
import { remapKeys } from "../utils/remapAxes";
import { isNil } from "es-toolkit";
import { SELECTION_UPDATE_TIMEOUT_MS } from "../constants";

export type UseSelectionManagerParameters = {
  selection: Ref<PlSelectionModel | undefined>;
  gridApi: ShallowRef<GridApi<PlAgDataTableV2Row> | null>;
  dataRenderedTracker: DeferredCircular<GridApi<PlAgDataTableV2Row>>;
};

export type UseSelectionManagerReturn = {
  /** Handler for ag-grid onSelectionChanged event */
  onSelectionChanged: (event: SelectionChangedEvent<PlAgDataTableV2Row>) => void;
  /** Controller method: update selection with axis remapping */
  updateSelection: (options: { axesSpec: AxisId[]; selectedKeys: PTableKey[] }) => Promise<boolean>;
  /** Called when axesSpec changes after pipeline — remaps existing selection */
  handleAxesSpecChange: (newAxesSpec: AxesSpec) => void;
  /** Clear selection and reset ag-grid selection state */
  clearSelection: () => void;
};

const defaultSelection = createPlSelectionModel();

export function useSelectionManager(
  params: UseSelectionManagerParameters,
): UseSelectionManagerReturn {
  const { selection, gridApi, dataRenderedTracker } = params;

  function onSelectionChanged(event: SelectionChangedEvent<PlAgDataTableV2Row>): void {
    if (selection.value !== undefined) {
      const state = event.api.getServerSideSelectionState();
      const selectedKeys =
        state?.toggledNodes?.map((nodeId) => parseJson(nodeId as PlTableRowIdJson)) ?? [];
      if (!isJsonEqual(selection.value.selectedKeys, selectedKeys)) {
        selection.value = { ...selection.value, selectedKeys };
      }
    }
  }

  async function updateSelection(options: {
    axesSpec: AxisId[];
    selectedKeys: PTableKey[];
  }): Promise<boolean> {
    const api = await dataRenderedTracker.promise;
    if (api.isDestroyed()) return false;

    const axes = selection.value?.axesSpec;
    if (isNil(axes)) return false;

    const remappedKeys = remapKeys(options.axesSpec, axes, options.selectedKeys);
    if (remappedKeys === null) return false;

    const selectedNodes = remappedKeys.map((key) => canonicalizeJson<PlTableRowId>(key));
    const oldSelectedKeys = api.getServerSideSelectionState()?.toggledNodes ?? [];

    if (!isJsonEqual(oldSelectedKeys, selectedNodes)) {
      api.setServerSideSelectionState({
        selectAll: false,
        toggledNodes: selectedNodes,
      });

      // Wait for `onSelectionChanged` to update `selection` model
      const scope = effectScope();
      const { resolve, promise } = Promise.withResolvers();
      scope.run(() => watch(selection, resolve, { once: true }));
      try {
        await promiseTimeout(promise, SELECTION_UPDATE_TIMEOUT_MS);
      } catch {
        return false;
      } finally {
        scope.stop();
      }
    }

    return true;
  }

  function setGridSelectionState(api: GridApi<PlAgDataTableV2Row>, keys: PTableKey[]): void {
    api.setServerSideSelectionState({
      selectAll: false,
      toggledNodes: keys.map((key) => canonicalizeJson<PlTableRowId>(key)),
    });
  }

  function handleAxesSpecChange(newAxesSpec: AxesSpec): void {
    if (selection.value === undefined) return;

    const { axesSpec: oldAxesSpec, selectedKeys: oldSelectedKeys } = selection.value;
    if (isJsonEqual(oldAxesSpec, newAxesSpec)) return;

    const api = gridApi.value;

    // If old axes are missing or length changed, clear selection
    if (isNil(oldAxesSpec) || oldAxesSpec.length !== newAxesSpec.length) {
      const newSelection: PlSelectionModel = { axesSpec: newAxesSpec, selectedKeys: [] };
      if (!isJsonEqual(selection.value, newSelection)) {
        selection.value = newSelection;
      }
      if (api !== null && !api.isDestroyed()) {
        api.setServerSideSelectionState({ selectAll: false, toggledNodes: [] });
      }
      return;
    }

    const remappedKeys = remapKeys(oldAxesSpec, newAxesSpec, oldSelectedKeys);

    // If remapping fails, clear selection
    if (remappedKeys === null) {
      const newSelection: PlSelectionModel = { axesSpec: newAxesSpec, selectedKeys: [] };
      if (!isJsonEqual(selection.value, newSelection)) {
        selection.value = newSelection;
      }
      if (api !== null && !api.isDestroyed()) {
        api.setServerSideSelectionState({ selectAll: false, toggledNodes: [] });
      }
      return;
    }

    // Remap succeeded — update selection and grid state
    const newSelection: PlSelectionModel = { axesSpec: newAxesSpec, selectedKeys: remappedKeys };
    if (!isJsonEqual(selection.value, newSelection)) {
      selection.value = newSelection;
    }
    if (api !== null && !api.isDestroyed()) {
      setGridSelectionState(api, remappedKeys);
    }
  }

  function clearSelection(): void {
    if (selection.value !== undefined && !isJsonEqual(selection.value, defaultSelection)) {
      selection.value = createPlSelectionModel();
    }

    const api = gridApi.value;
    if (api !== null && !api.isDestroyed()) {
      api.setServerSideSelectionState({ selectAll: false, toggledNodes: [] });
    }
  }

  return {
    onSelectionChanged,
    updateSelection,
    handleAxesSpecChange,
    clearSelection,
  };
}
