<script lang="ts" setup>
import { computed } from 'vue';
import type { TableData } from './types';
import { injectState } from './keys';
import { tapIf, toList } from '@milaboratory/helpers/utils';

const props = defineProps<{
  tableData: TableData;
}>();

const state = injectState();

const operations = computed(() => state.settings.value.operations ?? {});

const selected = computed(() => toList(props.tableData.selectedRows));

const isVisible = computed(() => selected.value.length > 0);

const onDelete = () => {
  tapIf(operations.value?.onDelete, (cb) => cb(selected.value));
  props.tableData.selectedRows.clear();
};
</script>

<template>
  <div v-if="isVisible" class="command-menu">
    <span>selected {{ selected.length }}</span>
    <button v-if="operations.onDelete" @click="onDelete">Delete</button>
  </div>
</template>
