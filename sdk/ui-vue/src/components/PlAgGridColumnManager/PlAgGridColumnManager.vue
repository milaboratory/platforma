<script setup lang="ts">
import { type Column, type GridApi } from 'ag-grid-enterprise';
import { PlBtnGhost, PlMaskIcon16, PlMaskIcon24, PlSlideModal, PlTooltip, useSortable2 } from '@milaboratories/uikit';
import { ref, toRefs, watch } from 'vue';
import './pl-ag-grid-column-manager.scss';
import { PlAgDataTableToolsPanelId } from '../PlAgDataTableToolsPanel/PlAgDataTableToolsPanelId';

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

useSortable2(listRef, {
  handle: '.handle',
  onChange(indices) {
    gridApi.value.moveColumns(indices.map((i) => columns.value[i]), 0);
  },
});

function toggleColumnVisibility(col: Column) {
  gridApi.value.setColumnsVisible([col], !col.isVisible());
}

watch(
  () => gridApi.value,
  (gridApi) => {
    columns.value = gridApi.getAllGridColumns();
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
      <template #title>Manage Columns</template>

      <div ref="listRef" :key="listKey" class="pl-ag-columns pl-2 pr-2">
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
          <div v-if="col.getColDef().lockPosition" class="pl-ag-columns__pin">
            <PlMaskIcon24 name="pin" />
          </div>
        </div>
      </div>
    </PlSlideModal>
  </div>
</template>
