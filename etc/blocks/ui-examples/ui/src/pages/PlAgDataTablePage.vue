<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  type PlDataTableSettings,
  PlAgDataTableToolsPanel,
  PlTableFilters,
  PlBlockPage,
  PlAgDataTable,
} from '@platforma-sdk/ui-vue';
import { useApp } from '../app';
import type { PTableColumnSpec } from '@platforma-sdk/model';

const app = useApp();

if (!app.model.ui?.dataTableState) {
  app.model.ui = {
    dataTableState: {
      tableState: {
        gridState: {},
      },
      filterModel: {},
    },
  };
}

const tableSettings = computed<PlDataTableSettings | undefined>(() => (
  {
    sourceType: 'ptable',
    pTable: app.model.outputs.pt,
    sheets: [],
  }
));
const columns = ref<PTableColumnSpec[]>([]);
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>PlAgDataTable</template>
    <template #append>
      <PlAgDataTableToolsPanel>
        <PlTableFilters v-model="app.model.ui.dataTableState!.filterModel" :columns="columns" />
      </PlAgDataTableToolsPanel>
    </template>
    <PlAgDataTable
      ref="tableInstance"
      v-model="app.model.ui.dataTableState!.tableState"
      :settings="tableSettings"
      show-columns-panel
      show-export-button
      @columns-changed="(newColumns) => (columns = newColumns)"
    />
  </PlBlockPage>
</template>
