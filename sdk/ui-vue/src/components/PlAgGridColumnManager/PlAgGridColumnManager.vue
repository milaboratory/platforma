<script setup lang="ts">
import { PlBtnGhost, PlElementList, PlSearchField, PlSlideModal, usePlBlockPageTitleTeleportTarget } from '@milaboratories/uikit';
import { type Column, type DisplayedColumnsChangedEvent, type GridApi } from 'ag-grid-enterprise';
import { computed, ref, toRefs, watch } from 'vue';
import { PlAgDataTableRowNumberColId } from '../PlAgDataTable/sources/row-number';
import { useFilteredItems } from './useFilteredItems';

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

const query = ref('');

const slideModal = ref(false);
const teleportTarget = usePlBlockPageTitleTeleportTarget('PlAgGridColumnManager');

const { filteredItems, segments } = useFilteredItems(() => ({
  items: items.value,
  query: query.value,
  getStrings: (item) => [item.label],
}));
</script>

<template>
  <Teleport v-if="teleportTarget" :to="teleportTarget">
    <PlBtnGhost icon="columns" @click.stop="slideModal = !slideModal">
      Columns
    </PlBtnGhost>
  </Teleport>

  <PlSlideModal v-model="slideModal" :width="width" close-on-outside-click>
    <template #title>Manage Columns</template>
    <PlSearchField v-model="query" clearable />
    <PlElementList
      :items="filteredItems"
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
      :disable-dragging="query.length > 0"
      disable-removing
    >
      <template #item-title="{ item }">
        <span>
          <span
            v-for="(segment, i) of segments.get(item.label)"
            :key="i"
            :class="{ [$style.match]: segment.match }"
          >{{ segment.value }}</span>
        </span>
      </template>
    </PlElementList>
  </PlSlideModal>
</template>

<style module>
.match {
  background-color: var(--color-active-select);
  border-radius: 2px;
}
</style>
