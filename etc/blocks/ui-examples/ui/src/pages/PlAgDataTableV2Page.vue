<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  type PlAgDataTableSettings,
  PlAgDataTableToolsPanel,
  PlTableFilters,
  PlBlockPage,
  PlAgDataTableV2,
  PlNumberField,
  PlCheckbox,
} from '@platforma-sdk/ui-vue';
import { useApp } from '../app';
import type { PTableColumnSpec } from '@platforma-sdk/model';
import type { ICellRendererParams } from 'ag-grid-enterprise';
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
    model: app.model.outputs.ptV2,
    sheets: [],
  }
));
const columns = ref<PTableColumnSpec[]>([]);

const verbose = ref(false);

const cellRendererSelector = computed(() => {
  if (!verbose.value) return;

  return (params: ICellRendererParams) => {
    if (params.colDef?.cellDataType === 'number') {
      return ({
        component: () => 'Number is ' + params.value + '',
      });
    }
  };
});
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>PlAgDataTable V2</template>
    <template #append>
      <PlAgDataTableToolsPanel>
        <PlTableFilters v-model="app.model.ui.dataTableState!.filterModel" :columns="columns" />
      </PlAgDataTableToolsPanel>
    </template>
    <PlAgDataTableV2
      ref="tableInstance"
      v-model="app.model.ui.dataTableState!.tableState"
      :settings="tableSettings"
      :cell-renderer-selector="cellRendererSelector"
      show-columns-panel
      show-export-button
      @columns-changed="(newColumns) => (columns = newColumns)"
    >
      <template #before-sheets>
        Table controls could be placed here
        <PlNumberField v-model="app.model.args.tableNumRows" />
        <PlCheckbox v-model="verbose">Use custom cell renderer for numbers</PlCheckbox>
      </template>
    </PlAgDataTableV2>
  </PlBlockPage>
</template>
