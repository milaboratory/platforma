<script setup lang="ts">
import {
  PlBtnGhost,
  PlElementList,
  PlSearchField,
  PlSlideModal,
  usePlBlockPageTitleTeleportTarget,
} from "@milaboratories/uikit";
import { type GridApi } from "ag-grid-enterprise";
import { computed, ref } from "vue";
import { PlAgDataTableRowNumberColId } from "../PlAgDataTable/sources/row-number";
import { useFilteredItems } from "./useFilteredItems";
import { useGridColumns } from "./useGridColumns";

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

const query = ref("");
const slideModal = ref(false);
const teleportTarget = usePlBlockPageTitleTeleportTarget("PlAgGridColumnManager");

const columns = useGridColumns(props);

const items = computed(() => {
  return columns.value.map((col, i) => ({
    column: col,
    id: col.getId(),
    label: col.getColDef().headerName ?? `Unnamed Column (${i + 1})`,
  }));
});

const { filteredItems, segments } = useFilteredItems({
  items,
  query,
  getStrings: (item) => [item.label],
});
</script>

<template>
  <Teleport v-if="teleportTarget" :to="teleportTarget">
    <PlBtnGhost icon="columns" @click.stop="slideModal = !slideModal"> Columns </PlBtnGhost>
  </Teleport>

  <PlSlideModal v-model="slideModal" :width="width" close-on-outside-click>
    <template #title>Manage Columns</template>
    <PlSearchField v-model="query" clearable />
    <PlElementList
      :items="filteredItems"
      :get-item-key="(item) => item.id"
      :is-draggable="(item) => !item.column.getColDef().lockPosition"
      :on-sort="
        (fromIndex, toIndex) => {
          if (!props.api.isDestroyed()) {
            const columnToMove = columns[fromIndex];
            props.api.moveColumns([columnToMove], toIndex);
          }
          return true; // Let PlElementList handle the visual update
        }
      "
      :on-toggle="
        (item) => {
          if (!props.api.isDestroyed()) {
            props.api.setColumnsVisible([item.column], !item.column.isVisible());
          }
        }
      "
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
            >{{ segment.value }}</span
          >
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
