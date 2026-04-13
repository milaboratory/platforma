import { ref } from "vue";
import type { Ref, ShallowRef } from "vue";
import type { GridApi, ManagedGridOptions } from "ag-grid-enterprise";
import type {
  PlAgDataTableV2Row,
  PlAgOverlayLoadingParams,
  PlAgOverlayNoRowsParams,
} from "../../PlAgDataTable/types";
import type { OverlayVariant, OverlayTexts } from "../types";
import PlAgRowCount from "../../PlAgDataTable/PlAgRowCount.vue";

type UseOverlaysParameters = {
  gridApi: ShallowRef<GridApi<PlAgDataTableV2Row> | null>;
  updateOptions: (partial: Partial<ManagedGridOptions<PlAgDataTableV2Row>>) => void;
  initialLoadingText?: string;
  initialRunningText?: string;
  initialNotReadyText?: string;
  initialNoRowsText?: string;
};

type UseOverlaysReturn = {
  showLoading: (variant: OverlayVariant) => void;
  hideLoading: () => void;
  showNoRows: () => void;
  updateTexts: (texts: OverlayTexts) => void;
  isLoading: Ref<boolean>;
};

const STATUS_BAR_WITH_ROW_COUNT = {
  statusPanels: [{ statusPanel: PlAgRowCount, align: "left" as const }],
};

export function useOverlays(params: UseOverlaysParameters): UseOverlaysReturn {
  const { gridApi, updateOptions } = params;

  const isLoading = ref(true);

  const currentLoadingParams = ref<PlAgOverlayLoadingParams>({
    variant: "not-ready",
    loadingText: params.initialLoadingText,
    runningText: params.initialRunningText,
    notReadyText: params.initialNotReadyText,
  });

  const currentNoRowsParams = ref<PlAgOverlayNoRowsParams>({
    text: params.initialNoRowsText,
  });

  const showLoading = (variant: OverlayVariant): void => {
    // ag-grid constraint: must hide any active no-rows overlay before showing loading
    if (gridApi.value !== null) {
      gridApi.value.hideOverlay();
    }

    const loadingOverlayComponentParams: PlAgOverlayLoadingParams = {
      ...currentLoadingParams.value,
      variant,
    };
    currentLoadingParams.value = loadingOverlayComponentParams;

    updateOptions({
      loading: true,
      loadingOverlayComponentParams,
      statusBar: undefined,
    });

    isLoading.value = true;
  };

  const hideLoading = (): void => {
    updateOptions({
      loading: false,
      statusBar: STATUS_BAR_WITH_ROW_COUNT,
    });

    isLoading.value = false;
  };

  const showNoRows = (): void => {
    updateOptions({
      loading: false,
      statusBar: STATUS_BAR_WITH_ROW_COUNT,
    });

    // ag-grid requires loading to be false before showing no-rows overlay
    if (gridApi.value !== null) {
      gridApi.value.showNoRowsOverlay();
    }

    isLoading.value = false;
  };

  const updateTexts = (texts: OverlayTexts): void => {
    const loadingOverlayComponentParams: PlAgOverlayLoadingParams = {
      ...currentLoadingParams.value,
      ...(texts.loadingText !== undefined ? { loadingText: texts.loadingText } : {}),
      ...(texts.runningText !== undefined ? { runningText: texts.runningText } : {}),
      ...(texts.notReadyText !== undefined ? { notReadyText: texts.notReadyText } : {}),
    };
    currentLoadingParams.value = loadingOverlayComponentParams;

    const noRowsOverlayComponentParams: PlAgOverlayNoRowsParams = {
      ...currentNoRowsParams.value,
      ...(texts.noRowsText !== undefined ? { text: texts.noRowsText } : {}),
    };
    currentNoRowsParams.value = noRowsOverlayComponentParams;

    updateOptions({
      loadingOverlayComponentParams,
      noRowsOverlayComponentParams,
    });
  };

  return {
    showLoading,
    hideLoading,
    showNoRows,
    updateTexts,
    isLoading,
  };
}
