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
  PlDropdown,
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

const sources = [...new Array(10)].map((_, i) => {
  return {
    label: `Source ${1 + i}`,
    value: `source_${i}`,
  };
});
const activeSource = ref(sources[0].value);

const tableSettings = computed<PlDataTableSettingsV2>(() => (
  activeSource.value && app.model.outputs.ptV2Sheets
    ? {
        sourceId: activeSource.value,
        sheets: app.model.outputs.ptV2Sheets,
        model: app.model.outputs.ptV2,
      }
    : { sourceId: null }
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

const selection = ref<PlSelectionModel>({
  axesSpec: [],
  selectedKeys: [],
});
watch(
  () => selection.value,
  (selection) => console.log(`selection changed`, toValue(selection)),
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
        <PlNumberField v-model="app.model.args.tableNumRows" />
        <PlCheckbox v-model="verbose">Use custom cell renderer for numbers</PlCheckbox>
        <PlDropdown v-model="activeSource" :options="sources" clearable />
      </template>
    </PlAgDataTableV2>
  </PlBlockPage>
</template>
