<script lang="ts" setup>
import { PlCheckbox } from '@milaboratories/uikit';
import type { IHeaderParams } from 'ag-grid-enterprise';
import { computed, onBeforeMount, onBeforeUnmount, ref } from 'vue';

const { params } = defineProps<{
  params: IHeaderParams;
}>();

const selectedRowCount = ref(params.api.getSelectedRows().length);
const totalRowCount = ref(params.api.getDisplayedRowCount());
const isSelectable = ref(Boolean(params.api.getGridOption('rowSelection')));

const allRowsSelected = computed(() =>
  selectedRowCount.value === totalRowCount.value
  && selectedRowCount.value > 0,
);

function updateRowCounts() {
  selectedRowCount.value = params.api.getSelectedRows().length;
  totalRowCount.value = params.api.getDisplayedRowCount();
}

function updateIsSelectable() {
  isSelectable.value = Boolean(params.api.getGridOption('rowSelection'));
}

onBeforeMount(() => {
  params.api.addEventListener('selectionChanged', updateRowCounts);
  params.api.addEventListener('rowDataUpdated', updateRowCounts);
  params.api.addEventListener('modelUpdated', updateRowCounts);
  params.api.addEventListener('stateUpdated', updateIsSelectable);
});

onBeforeUnmount(() => {
  params.api.removeEventListener('selectionChanged', updateRowCounts);
  params.api.removeEventListener('rowDataUpdated', updateRowCounts);
  params.api.removeEventListener('modelUpdated', updateRowCounts);
  params.api.removeEventListener('stateUpdated', updateIsSelectable);
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
      :model-value="allRowsSelected"
      :indeterminate="!allRowsSelected && selectedRowCount > 0"
      @update:model-value="
        allRowsSelected
          ? params.api.deselectAll()
          : params.api.selectAll()
      "
    />
    <span v-else>
      {{ params.displayName }}
    </span>
  </div>
</template>
