<script lang="ts" setup>
import { computed } from 'vue';
import { injectState } from './keys';
import { tapIf, toList } from '@milaboratory/helpers/utils';

const state = injectState();

const selectedColumns = computed(() => toList(state.data.selectedColumns));

const isVisible = computed(() => selectedColumns.value.length > 0);

const hasOnDeleteColumns = computed(() => !!state.settings.value?.onDeleteColumns && selectedColumns.value.length);

const onDeleteColumns = () => {
  tapIf(state.settings.value?.onDeleteColumns, (cb) => cb(selectedColumns.value));
  state.data.selectedColumns.clear();
};
</script>

<template>
  <div v-if="isVisible" class="command-menu">
    <span v-if="selectedColumns.length">selected columns {{ selectedColumns.length }}</span>
    <hr />
    <span v-if="hasOnDeleteColumns" class="command" @click="onDeleteColumns">Delete</span>
  </div>
</template>
