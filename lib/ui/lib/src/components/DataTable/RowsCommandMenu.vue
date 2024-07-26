<script lang="ts" setup>
import { computed } from 'vue';
import { injectState } from './keys';
import { tapIf } from '@milaboratory/helpers/utils';

const state = injectState();

const selectedRows = computed(() => state.getSelectedRows());

const isVisible = computed(() => selectedRows.value.length > 0);

const hasOnDeleteRows = computed(() => !!state.settings.value?.onDeleteRows);

const onDeleteRows = () => {
  tapIf(state.settings.value?.onDeleteRows, (cb) => cb(selectedRows.value));
  state.data.selectedRows.clear();
  state.data.rows = [];
};
</script>

<template>
  <div v-if="isVisible" class="command-menu">
    <span v-if="selectedRows.length">{{ selectedRows.length }} rows selected</span>
    <hr />
    <span v-if="hasOnDeleteRows" class="command" @click="onDeleteRows">Delete</span>
  </div>
</template>
