<script setup lang="ts">
import type { Column, GridApi } from '@ag-grid-community/core';
import { PlBtnGhost, PlMaskIcon16, PlMaskIcon24, PlSlideModal, PlTooltip, useSortable } from '@milaboratories/uikit';
import { ref, toRefs, watch } from 'vue';
import './pl-ag-grid-column-manager.scss';
import { PlAgDataTableToolsPanelId } from '../PlAgDataTableToolsPanel/PlAgDataTableToolsPanelId';
import { PlAgDataTableRowNumberColId } from '../PlAgDataTable';

const props = defineProps<{
  /**
   * The GridApi is an API interface provided by the table/grid component
   * for interacting programmatically with the grid's features and functionality.
   * It allows you to control and manipulate grid behavior, access data, and
   * trigger specific actions.
   */
  api: GridApi;
}>();
const { api: gridApi } = toRefs(props);

const columns = ref<Column[]>([]);
const listRef = ref<HTMLElement>();
const slideModal = ref(false);
const listKey = ref(0);

function getReorderedColumns(columns: Column[]) {
  const numRowsIndex = columns.findIndex((v) => v.getId() === PlAgDataTableRowNumberColId);
  if (numRowsIndex !== 0) {
    const [numRowsCol] = columns.splice(numRowsIndex, 1);
    return columns.splice(0, 0, numRowsCol);
  }
  return columns;
}

useSortable(listRef, {
  handle: '.handle',
  onChange(indices) {
    gridApi.value.moveColumns(getReorderedColumns(indices.map((i) => columns.value[i])), 0);
  },
});

function toggleColumnVisibility(col: Column) {
  gridApi.value.setColumnsVisible([col], !col.isVisible());
}

watch(
  () => gridApi.value,
  (gridApi) => {
    columns.value = getReorderedColumns(gridApi.getAllGridColumns());
    if (columns.value.length > 0) {
      gridApi.moveColumns(columns.value, 0);
    }

    gridApi.addEventListener('displayedColumnsChanged', (event) => {
      columns.value = event.api.getAllGridColumns();
      listKey.value++;
    });
  },
  { immediate: true },
);
</script>

<template>
  <div>
    <Teleport :to="`#${PlAgDataTableToolsPanelId}`">
      <PlBtnGhost @click.stop="slideModal = !slideModal">
        Columns
        <template #append>
          <PlMaskIcon24 name="columns" />
        </template>
      </PlBtnGhost>
    </Teleport>

    <PlSlideModal v-model="slideModal" :width="'368px'" close-on-outside-click>
      <template #title>Columns</template>

      <div ref="listRef" :key="listKey" class="pl-ag-columns">
        <div v-for="col in columns" :key="col.getId()" class="pl-ag-columns__item">
          <div :class="{ handle: !col.getColDef().lockPosition }" class="pl-ag-columns__drag">
            <PlMaskIcon16 name="drag-dots" />
          </div>
          <div :class="{ visible: col.isVisible() }" class="pl-ag-columns__title text-s-btn">{{ col.getColDef().headerName }}</div>
          <div class="pl-ag-columns__visibility" @click="toggleColumnVisibility(col)">
            <PlTooltip :close-delay="500" position="top">
              <PlMaskIcon24 :name="col.isVisible() ? 'view-show' : 'view-hide'" />
              <template #tooltip>Show/Hide</template>
            </PlTooltip>
          </div>
        </div>
      </div>
    </PlSlideModal>
  </div>
</template>
