<script lang="ts" setup>
import { computed } from 'vue';
import { injectState } from './keys';
import { tapIf, toList } from '@milaboratory/helpers/utils';

const state = injectState();

const selectedRows = computed(() => toList(state.data.selectedRows));

const selectedColumns = computed(() => toList(state.data.selectedColumns));

const isVisible = computed(() => selectedRows.value.length > 0);

const hasOnDeleteRows = computed(() => !!state.settings.value?.onDeleteRows);

const hasOnDeleteColumns = computed(() => !!state.settings.value?.onDeleteColumns);

const onDeleteRows = () => {
  tapIf(state.settings.value?.onDeleteRows, (cb) => cb(selectedRows.value));
  state.data.selectedRows.clear();
};

const onDeleteColumns = () => {
  tapIf(state.settings.value?.onDeleteColumns, (cb) => cb(selectedColumns.value));
  state.data.selectedColumns.clear();
};
</script>

<template>
  <div v-if="isVisible" class="command-menu">
    <span v-if="selectedRows.length">selected rows {{ selectedRows.length }}</span>
    <button v-if="hasOnDeleteRows" @click="onDeleteRows">Delete rows</button>
    <span v-if="selectedColumns.length">selected columns {{ selectedColumns.length }}</span>
    <button v-if="hasOnDeleteColumns" @click="onDeleteColumns">Delete columns</button>
  </div>
</template>
