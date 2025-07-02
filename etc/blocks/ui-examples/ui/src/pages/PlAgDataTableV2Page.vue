<script setup lang="ts">
import {
  computed,
  ref,
  watch,
  toValue,
} from 'vue';
import {
  isJsonEqual,
} from '@milaboratories/helpers';
import {
  PlAgDataTableToolsPanel,
  PlBlockPage,
  PlAgDataTableV2,
  PlNumberField,
  PlCheckbox,
  PlDropdown,
  usePlDataTableSettingsV2,
} from '@platforma-sdk/ui-vue';
import {
  useApp,
} from '../app';
import {
  matchAxisId,
  type PlSelectionModel,
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

const tableSettings = usePlDataTableSettingsV2({
  sourceId: () => activeSource.value,
  model: () => app.model.outputs.ptV2,
  sheets: () => app.model.outputs.ptV2Sheets,
  filtersConfig: ({ sourceId, column }) => {
    if (isJsonEqual(sourceId, sources[0].value)) {
      if (column.id === 'column1') {
        return {
          default: {
            type: 'string_contains',
            reference: '1',
          },
        };
      }
      if (column.id === 'column2') {
        return {
          options: ['isNotNA', 'isNA'],
        };
      }
    }
    if (isJsonEqual(sourceId, sources[1].value)) {
      if (column.type === 'axis' && matchAxisId({ type: 'Int', name: 'index' }, column.id)) {
        return {
          default: {
            type: 'number_lessThanOrEqualTo',
            reference: 10,
          },
        };
      }
    }
    return {};
  },
});

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
      <PlAgDataTableToolsPanel />
    </template>
    <PlAgDataTableV2
      ref="tableInstance"
      v-model="app.model.ui.dataTableStateV2"
      v-model:selection="selection"
      :settings="tableSettings"
      :cell-renderer-selector="cellRendererSelector"
      show-columns-panel
      show-export-button
    >
      <template #before-sheets>
        <PlNumberField v-model="app.model.args.tableNumRows" />
        <PlCheckbox v-model="verbose">Use custom cell renderer for numbers</PlCheckbox>
        <PlDropdown v-model="activeSource" :options="sources" clearable />
      </template>
    </PlAgDataTableV2>
  </PlBlockPage>
</template>
