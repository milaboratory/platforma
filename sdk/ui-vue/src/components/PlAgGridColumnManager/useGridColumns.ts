import { Column, GridApi } from "ag-grid-enterprise";
import { ref, watch } from "vue";

export function useGridColumns(props: { api: GridApi }) {
  const columns = ref<Column[]>([]);
  const syncColumns = () => (columns.value = props.api.getAllGridColumns());
  watch(
    () => props.api,
    (gridApi, _, onCleanup) => {
      if (gridApi.isDestroyed()) return;

      gridApi.addEventListener("displayedColumnsChanged", syncColumns);
      onCleanup(() => gridApi.removeEventListener("displayedColumnsChanged", syncColumns));

      columns.value = gridApi.getAllGridColumns();
      if (columns.value.length > 0) {
        gridApi.moveColumns(columns.value, 0);
      }
    },
    { immediate: true },
  );

  return columns;
}
