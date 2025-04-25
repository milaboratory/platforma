<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  type PlAgDataTableSettings,
  PlAgDataTableToolsPanel,
  PlTableFilters,
  PlBlockPage,
  PlAgDataTableV2,
  PlNumberField,
} from '@platforma-sdk/ui-vue';
import { useApp } from '../app';
import type { PTableColumnSpec } from '@platforma-sdk/model';

const app = useApp();

if (!app.model.ui?.dataTableState) {
  app.model.ui.dataTableState = {
    tableState: {
      gridState: {},
    },
    filterModel: {},
  };
}

const tableSettings = computed<PlAgDataTableSettings>(() => (
  {
    sourceType: 'ptable',
    pTable: app.model.outputs.ptV2,
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
    <PlAgDataTableV2
      ref="tableInstance"
      v-model="app.model.ui.dataTableState!.tableState"
      :settings="tableSettings"
      show-columns-panel
      show-export-button
      @columns-changed="(newColumns) => (columns = newColumns)"
    >
      <template #before-sheets>
        Table controls could be placed here
        <PlNumberField v-model="app.model.args.tableNumRows" />
      </template>
    </PlAgDataTableV2>
  </PlBlockPage>
</template>
