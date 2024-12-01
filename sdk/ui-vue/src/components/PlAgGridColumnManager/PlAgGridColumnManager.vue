<script setup lang="ts">
import type { Column, GridApi } from '@ag-grid-community/core';
import { PlBtnGhost, PlMaskIcon16, PlMaskIcon24, PlSlideModal, PlTooltip, useSortable } from '@milaboratories/uikit';
import { onMounted, ref, toRefs } from 'vue';
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

useSortable(listRef, {
  handle: '.handle',
  onChange(indices) {
    gridApi.value.moveColumns(
      indices.map((i) => columns.value[i]),
      0,
    );
  },
});

function toggleColumnVisibility(col: Column) {
  gridApi.value.setColumnsVisible([col], !col.isVisible());
}

onMounted(() => {
  gridApi.value.addEventListener('displayedColumnsChanged', () => {
    columns.value = [...(gridApi.value.getAllGridColumns() ?? [])];
    listKey.value++;
  });

  columns.value = gridApi.value.getAllGridColumns() ?? [];
});
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
          <div :class="{ visible: col.isVisible() }" class="pl-ag-columns__title">{{ col.getColDef().headerName }}</div>
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
