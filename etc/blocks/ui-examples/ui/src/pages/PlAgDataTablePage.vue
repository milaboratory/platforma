<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  type PlAgDataTableController,
  type PlDataTableSettings,
  PlAgDataTableToolsPanel,
  PlTableFilters,
  PlBtnGhost,
  PlMaskIcon24,
  PlBlockPage,
  PlAgDataTable,
  PlDropdownRef,
  PlSlideModal,
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

const settingsOpen = ref<boolean>(false);

const tableSettings = computed<PlDataTableSettings | undefined>(() =>
  app.model.ui.dataTableState!.anchorColumn
    ? {
        sourceType: 'ptable',
        pTable: app.model.outputs.pt,
        sheets: app.model.outputs.sheets,
      }
    : undefined,
);
const columns = ref<PTableColumnSpec[]>([]);
const tableInstance = ref<PlAgDataTableController>();
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>PlAgDataTable</template>
    <template #append>
      <PlAgDataTableToolsPanel>
        <PlTableFilters v-model="app.model.ui.dataTableState!.filterModel" :columns="columns" />
      </PlAgDataTableToolsPanel>
      <PlBtnGhost @click.stop="() => tableInstance?.exportCsv()">
        Export
        <template #append>
          <PlMaskIcon24 name="export" />
        </template>
      </PlBtnGhost>
      <PlBtnGhost @click.stop="() => (settingsOpen = true)">
        Settings
        <template #append>
          <PlMaskIcon24 name="settings" />
        </template>
      </PlBtnGhost>
    </template>
    <PlAgDataTable
      ref="tableInstance"
      v-model="app.model.ui.dataTableState!.tableState"
      :settings="tableSettings"
      show-columns-panel
      @columns-changed="(newColumns) => (columns = newColumns)"
    />
    <PlSlideModal v-model="settingsOpen" :close-on-outside-click="true">
      <template #title>Settings</template>
      <PlDropdownRef
        v-model="app.model.ui.dataTableState!.anchorColumn"
        label="Select column"
        :options="app.model.outputs.inputOptions"
        clearable
      />
    </PlSlideModal>
  </PlBlockPage>
</template>
