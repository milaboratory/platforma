<script setup lang="ts">
import { isJsonEqual } from '@milaboratories/helpers';
import { type PlSelectionModel } from '@platforma-sdk/model';
import {
  PlAgDataTableV2,
  PlBlockPage,
  PlCheckbox,
  PlDropdown,
  PlNumberField,
  PlBtnGhost,
  PlSlideModal,
  usePlDataTableSettingsV2,
  type PlTableLabeledSelectionModel,
  type PlAgDataTableV2Controller,
} from '@platforma-sdk/ui-vue';
import type { ICellRendererParams } from 'ag-grid-enterprise';
import {
  computed,
  onWatcherCleanup,
  ref,
  toValue,
  watch,
  watchEffect,
  useTemplateRef,
} from 'vue';
import { useApp } from '../app';

const app = useApp();

const settingsOpen = ref(false);

const sources = [...new Array(10)].map((_, i) => {
  return {
    label: `Source ${1 + i}`,
    value: `source_${i}`,
  };
});
const activeSource = ref(sources[0].value);

const loading = ref(false);
const tableSettings = usePlDataTableSettingsV2({
  sourceId: () => loading.value ? 'loading_source' : activeSource.value,
  model: () => loading.value ? undefined : app.model.outputs.ptV2,
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
      if (column.id === 'labelColumn') {
        return {
          default: {
            type: 'number_greaterThanOrEqualTo',
            reference: 100000 - 10,
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

const selectionLabeled = ref<PlTableLabeledSelectionModel>({
  spec: [],
  selectedLabeledKeys: [],
});
watch(
  () => selectionLabeled.value,
  (selection) => console.log(`selectionLabeled changed`, toValue(selection)),
);

const reactiveText = ref(false);

const now = ref(new Date());
const timeFormatter = new Intl.DateTimeFormat('en', { timeStyle: 'medium' });

const reactiveTextProps = computed(() => {
  if (!reactiveText.value) return;
  const formattedNow = timeFormatter.format(now.value);
  return {
    loadingText: 'Loading at ' + formattedNow,
    notReadyText: 'Not ready at ' + formattedNow,
    noRowsText: 'No rows at ' + formattedNow,
  };
});

watchEffect(() => {
  if (!reactiveText.value) return;
  let animationFrame = requestAnimationFrame(function tick() {
    now.value = new Date();
    animationFrame = requestAnimationFrame(tick);
  });
  onWatcherCleanup(() => {
    if (typeof animationFrame !== 'undefined') {
      cancelAnimationFrame(animationFrame);
    }
  });
});

const tableRef = useTemplateRef<PlAgDataTableV2Controller>('tableRef');
watch(
  () => [tableRef.value, app.model.outputs.ptV2] as const,
  ([table]) => {
    if (!table) return;
    if (selection.value.selectedKeys.length > 0) {
      table.focusRow(selection.value.selectedKeys[0]);
    }
  },
);

</script>

<template>
  <PlBlockPage>
    <template #title>PlAgDataTable V2</template>
    <template #append>
      <PlBtnGhost icon="settings" @click.exact.stop="() => (settingsOpen = true)">
        Settings
      </PlBtnGhost>
    </template>
    <PlAgDataTableV2
      ref="tableRef"
      v-model="app.model.ui.dataTableStateV2"
      v-model:selection="selection"
      v-model:selection-labeled="selectionLabeled"
      :settings="tableSettings"
      :cell-renderer-selector="cellRendererSelector"
      v-bind="reactiveTextProps"
      show-export-button
    >
      <template #before-sheets>
        <PlDropdown v-model="activeSource" :options="sources" clearable />
        <PlNumberField v-model="app.model.args.tableNumRows" />
      </template>
    </PlAgDataTableV2>
  </PlBlockPage>
  <PlSlideModal v-model="settingsOpen" :close-on-outside-click="true">
    <template #title>Settings</template>
    <PlCheckbox v-model="verbose">Apply custom cell renderer for numbers</PlCheckbox>
    <PlCheckbox v-model="loading">Display infinite loading</PlCheckbox>
    <PlCheckbox v-model="reactiveText">Show reactive loading message</PlCheckbox>
  </PlSlideModal>
</template>
