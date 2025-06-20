<script setup lang="ts">
import {
  computed,
  ref,
  watch,
  toValue,
} from 'vue';
import type {
  PlDataTableSettingsV2,
} from '@platforma-sdk/ui-vue';
import {
  PlAgDataTableToolsPanel,
  PlTableFilters,
  PlBlockPage,
  PlAgDataTableV2,
  PlNumberField,
  PlCheckbox,
  PlBtnPrimary,
} from '@platforma-sdk/ui-vue';
import {
  useApp,
} from '../app';
import type {
  PlSelectionModel,
  PTableColumnSpec,
} from '@platforma-sdk/model';
import type {
  ICellRendererParams,
} from 'ag-grid-enterprise';

const app = useApp();

const sourceGeneration = ref(0);

const tableSettings = computed<PlDataTableSettingsV2>(() => ({
  sourceId: `source_${sourceGeneration.value}`,
  model: app.model.outputs.ptV2,
}));

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

const selection = ref<PlSelectionModel>({
  axesSpec: [],
  selectedKeys: [],
});
watch(
  () => selection.value,
  (selection, oldSelection) => {
    selection.selectedKeys.sort();
    if (oldSelection) {
      oldSelection.selectedKeys.sort();
      if (oldSelection.selectedKeys.length === selection.selectedKeys.length) {
        if (oldSelection.selectedKeys.every((key, index) => key === selection.selectedKeys[index])) {
          return;
        }
      }
    }
    console.log(`selection changed`, toValue(selection));
  },
  { deep: true },
);
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>PlAgDataTable V2</template>
    <template #append>
      <PlAgDataTableToolsPanel>
        <PlTableFilters v-model="app.model.ui.dataTableStateV2.filterModel" :columns="columns" />
      </PlAgDataTableToolsPanel>
    </template>
    <PlAgDataTableV2
      ref="tableInstance"
      v-model="app.model.ui.dataTableStateV2.tableState"
      v-model:selection="selection"
      :settings="tableSettings"
      :cell-renderer-selector="cellRendererSelector"
      show-columns-panel
      show-export-button
      @columns-changed="(info) => (columns = info.columns)"
    >
      <template #before-sheets>
        Table controls could be placed here
        <PlNumberField v-model="app.model.args.tableNumRows" />
        <PlCheckbox v-model="verbose">Use custom cell renderer for numbers</PlCheckbox>
        <PlBtnPrimary @click="sourceGeneration++">
          Change sourceId
        </PlBtnPrimary>
      </template>
    </PlAgDataTableV2>
  </PlBlockPage>
</template>
