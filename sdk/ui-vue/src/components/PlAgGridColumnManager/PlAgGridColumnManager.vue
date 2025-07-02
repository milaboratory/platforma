<script setup lang="ts">
import { type Column, type DisplayedColumnsChangedEvent, type GridApi } from 'ag-grid-enterprise';
import { PlBtnGhost, PlSlideModal, PlElementList } from '@milaboratories/uikit';
import { ref, toRefs, watch, computed } from 'vue';
import { useDataTableToolsPanelTarget } from '../PlAgDataTableToolsPanel';
import { PlAgDataTableRowNumberColId } from '../PlAgDataTable/sources/row-number';

const props = defineProps<{
  /**
   * The GridApi is an API interface provided by the table/grid component
   * for interacting programmatically with the grid's features and functionality.
   * It allows you to control and manipulate grid behavior, access data, and
   * trigger specific actions.
   */
  api: GridApi;
  /**
   * Css Column Manager (Panel) modal width (default value is `368px`)
   */
  width?: string;
}>();

const { api: gridApi } = toRefs(props);

const columns = ref<Column[]>([]);
watch(
  () => gridApi.value,
  (gridApi) => {
    if (gridApi.isDestroyed()) return;

    gridApi.addEventListener('displayedColumnsChanged', (event: DisplayedColumnsChangedEvent) => {
      columns.value = event.api.getAllGridColumns();
    });

    columns.value = gridApi.getAllGridColumns();
    if (columns.value.length > 0) {
      gridApi.moveColumns(columns.value, 0);
    }
  },
  { immediate: true },
);

const items = computed(() => {
  return columns.value.map((col) => ({
    column: col,
    id: col.getId(),
    label: col.getColDef().headerName!,
  }));
});

const slideModal = ref(false);
const teleportTarget = useDataTableToolsPanelTarget();
</script>

<template>
  <div>
    <Teleport v-if="teleportTarget" :to="teleportTarget">
      <PlBtnGhost icon="columns" @click.stop="slideModal = !slideModal">
        Columns
      </PlBtnGhost>
    </Teleport>

    <PlSlideModal v-model="slideModal" :width="width" close-on-outside-click>
      <template #title>Manage Columns</template>
      <PlElementList
        :items="items"
        :get-item-key="(item) => item.id"
        :is-draggable="(item) => !item.column.getColDef().lockPosition"
        :on-sort="(fromIndex, toIndex) => {
          if (!gridApi.isDestroyed()) {
            const columnToMove = columns[fromIndex];
            gridApi.moveColumns([columnToMove], toIndex);
          }
          return true; // Let PlElementList handle the visual update
        }"
        :on-toggle="(item) => {
          if (!gridApi.isDestroyed()) {
            gridApi.setColumnsVisible([item.column], !item.column.isVisible());
          }
        }"
        :is-toggled="(item) => !item.column.isVisible()"
        :is-toggable="(item) => item.id !== PlAgDataTableRowNumberColId"
        :is-pinned="(item) => !!item.column.getColDef().lockPosition"
        :is-pinnable="() => false"
        disable-removing
      >
        <template #item-title="{ item }">
          {{ item.label }}
        </template>
      </PlElementList>
    </PlSlideModal>
  </div>
</template>
