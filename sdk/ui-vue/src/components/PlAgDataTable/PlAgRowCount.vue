<script lang="ts" setup>
import type { GridApi } from 'ag-grid-enterprise';
import { computed, onBeforeMount, onBeforeUnmount, ref } from 'vue';

const { params } = defineProps<{
  params: { api: GridApi };
}>();

const totalRowCount = ref(params.api.getDisplayedRowCount());
const selectedRowCount = ref(params.api.getSelectedRows().length);

const pluralRules = new Intl.PluralRules('en');
const numberFormatter = new Intl.NumberFormat('en');

const output = computed(() => {
  let result = numberFormatter.format(totalRowCount.value) + ' ';
  result += pluralRules.select(totalRowCount.value) === 'one' ? 'row' : 'rows';
  if (selectedRowCount.value > 0) {
    result += ' (' + numberFormatter.format(selectedRowCount.value) + ' selected)';
  }
  return result;
});

function updateRowCounts() {
  totalRowCount.value = params.api.getDisplayedRowCount();
  selectedRowCount.value = params.api.getSelectedRows().length;
}

onBeforeMount(() => {
  params.api.addEventListener('selectionChanged', updateRowCounts);
  params.api.addEventListener('rowDataUpdated', updateRowCounts);
  params.api.addEventListener('modelUpdated', updateRowCounts);
});

onBeforeUnmount(() => {
  params.api.removeEventListener('selectionChanged', updateRowCounts);
  params.api.removeEventListener('rowDataUpdated', updateRowCounts);
  params.api.removeEventListener('modelUpdated', updateRowCounts);
});
</script>

<template>
  {{ output }}
</template>
