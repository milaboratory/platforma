<script setup lang="ts">
import { isJsonEqual } from "@milaboratories/helpers";
import { type PlSelectionModel } from "@platforma-sdk/model";
import {
  PlAgDataTableV2,
  PlBlockPage,
  PlCheckbox,
  PlDropdown,
  PlNumberField,
  PlBtnGhost,
  PlSlideModal,
  PlBtnSecondary,
  usePlDataTableSettingsV2,
  type PlAgDataTableV2Controller,
} from "@platforma-sdk/ui-vue";
import type { ICellRendererParams } from "ag-grid-enterprise";
import {
  computed,
  onWatcherCleanup,
  ref,
  watch,
  watchEffect,
  useTemplateRef,
  toRaw,
} from "vue";
import { useApp } from "../app";

const app = useApp();

const settingsOpen = ref(false);

const sources = Array.from({ length: 10 }, (_, i) => ({
  label: `Source ${1 + i}`,
  value: `source_${1 + i}`,
}));

const loading = ref(false);
const tableSettings = usePlDataTableSettingsV2({
  sourceId: () =>
    loading.value ? "loading_source" : app.model.ui.dataTableV2.sourceId,
  model: () => app.model.outputs.ptV2,
  sheets: () => app.model.outputs.ptV2Sheets,
  filtersConfig: ({ sourceId, column }) => {
    if (isJsonEqual(sourceId, sources[0].value)) {
      if (column.id === "column1") {
        return {
          default: {
            type: "string_contains",
            reference: "1",
          },
        };
      }
      if (column.id === "column2") {
        return {
          options: ["isNotNA", "isNA"],
        };
      }
    }
    if (isJsonEqual(sourceId, sources[1].value)) {
      if (column.id === "labelColumn") {
        return {
          default: {
            type: "number_greaterThanOrEqualTo",
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
    if (params.colDef?.cellDataType === "number") {
      return {
        component: () => "Number is " + params.value + "",
      };
    }
  };
});

const initialSelection: PlSelectionModel = {
  axesSpec: [
    {
      name: "part",
      type: "Int",
    },
    {
      name: "index",
      type: "Int",
    },
    {
      name: "linkedIndex",
      type: "Int",
    },
  ],
  selectedKeys: [[0, 51, 51]],
};
const selection = ref<PlSelectionModel>(initialSelection);
watch(
  () => selection.value,
  (selection) => console.log(`selection changed`, toRaw(selection))
);

const reactiveText = ref(false);

const now = ref(new Date());
const timeFormatter = new Intl.DateTimeFormat("en", { timeStyle: "medium" });

const reactiveTextProps = computed(() => {
  if (!reactiveText.value) return;
  const formattedNow = timeFormatter.format(now.value);
  return {
    loadingText: "Loading at " + formattedNow,
    notReadyText: "Not ready at " + formattedNow,
    noRowsText: "No rows at " + formattedNow,
  };
});

watchEffect(() => {
  if (!reactiveText.value) return;
  let animationFrame = requestAnimationFrame(function tick() {
    now.value = new Date();
    animationFrame = requestAnimationFrame(tick);
  });
  onWatcherCleanup(() => {
    if (typeof animationFrame !== "undefined") {
      cancelAnimationFrame(animationFrame);
    }
  });
});

const tableRef = useTemplateRef<PlAgDataTableV2Controller>("tableRef");
const focusFirstSelectedRow = async () => {
  if (selection.value.selectedKeys.length > 0) {
    const key = selection.value.selectedKeys[0];
    await tableRef.value?.focusRow(key);
  }
};
const resetSelection = async () => {
  await tableRef.value?.updateSelection(initialSelection);
  await tableRef.value?.focusRow(selection.value.selectedKeys[0]);
};
</script>

<template>
  <PlBlockPage>
    <template #title>PlAgDataTable V2</template>
    <template #append>
      <PlBtnGhost
        icon="settings"
        @click.exact.stop="() => (settingsOpen = true)"
      >
        Settings
      </PlBtnGhost>
    </template>
    <PlAgDataTableV2
      ref="tableRef"
      v-model="app.model.ui.dataTableV2.state"
      v-model:selection="selection"
      :settings="tableSettings"
      :cell-renderer-selector="cellRendererSelector"
      v-bind="reactiveTextProps"
      show-export-button
      @new-data-rendered="focusFirstSelectedRow"
    >
      <template #before-sheets>
        <PlDropdown
          v-model="app.model.ui.dataTableV2.sourceId"
          :options="sources"
          clearable
        />
        <PlNumberField v-model="app.model.ui.dataTableV2.numRows" />
      </template>
    </PlAgDataTableV2>
  </PlBlockPage>
  <PlSlideModal v-model="settingsOpen" :close-on-outside-click="true">
    <template #title>Settings</template>
    <PlCheckbox v-model="verbose"
      >Apply custom cell renderer for numbers</PlCheckbox
    >
    <PlCheckbox v-model="loading">Display infinite loading</PlCheckbox>
    <PlCheckbox v-model="reactiveText"
      >Show reactive loading message</PlCheckbox
    >
    <PlBtnSecondary @click="resetSelection"
      >Reset selection to default</PlBtnSecondary
    >
  </PlSlideModal>
</template>
