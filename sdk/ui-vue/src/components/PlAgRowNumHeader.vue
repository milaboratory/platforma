<script lang="ts" setup>
import { PlCheckbox } from "@milaboratories/uikit";
import type { IHeaderParams } from "ag-grid-enterprise";
import { computed, onBeforeMount, onBeforeUnmount, ref } from "vue";
import {
  deselectAll,
  getSelectedRowsCount,
  getTotalRowsCount,
  isSelectionEnabled,
  selectAll,
} from "../lib";

const { params } = defineProps<{
  params: IHeaderParams;
}>();

const selectedRowCount = ref(getSelectedRowsCount(params.api));
const totalRowCount = ref(getTotalRowsCount(params.api));
const isSelectable = ref(isSelectionEnabled(params.api));

const someRowsSelected = computed(() => selectedRowCount.value > 0);

const allRowsSelected = computed(
  () => someRowsSelected.value && selectedRowCount.value === totalRowCount.value,
);

function toggleSelectAll() {
  if (someRowsSelected.value) {
    deselectAll(params.api);
  } else {
    selectAll(params.api);
  }
}

function updateRowCounts() {
  selectedRowCount.value = getSelectedRowsCount(params.api);
  totalRowCount.value = getTotalRowsCount(params.api);
}

function updateIsSelectable() {
  isSelectable.value = isSelectionEnabled(params.api);
}

onBeforeMount(() => {
  params.api.addEventListener("selectionChanged", updateRowCounts);
  params.api.addEventListener("rowDataUpdated", updateRowCounts);
  params.api.addEventListener("modelUpdated", updateRowCounts);
  params.api.addEventListener("stateUpdated", updateIsSelectable);
});

onBeforeUnmount(() => {
  params.api.removeEventListener("selectionChanged", updateRowCounts);
  params.api.removeEventListener("rowDataUpdated", updateRowCounts);
  params.api.removeEventListener("modelUpdated", updateRowCounts);
  params.api.removeEventListener("stateUpdated", updateIsSelectable);
});
</script>

<template>
  <div
    style="
      position: absolute;
      inset: 0;
      display: flex;
      justify-content: center;
      align-items: center;
    "
  >
    <PlCheckbox
      v-if="isSelectable"
      :model-value="someRowsSelected"
      :indeterminate="someRowsSelected && !allRowsSelected"
      @update:model-value="toggleSelectAll"
    />
    <span v-else>
      {{ params.displayName }}
    </span>
  </div>
</template>
