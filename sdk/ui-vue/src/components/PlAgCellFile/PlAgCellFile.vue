<script setup lang="ts">
import { PlFileInput } from '@milaboratories/uikit';
import type { ICellRendererParams } from '@ag-grid-community/core';
import type { ImportFileHandle, ImportProgress } from '@platforma-sdk/model';
import { computed } from 'vue';

const props = defineProps<{
  // this component is intended to be used in ag-grid, params are the main object
  // to communicate with the corresponding cell data
  params: ICellRendererParams<unknown, ImportFileHandle> & { extensions?: string[]; progress?: ImportProgress };
}>();

const extensions = computed(() => props.params.extensions);

// extracting cell value and casting it to the type we expect
const handle = computed(() => props.params.value as ImportFileHandle | undefined);

/**
 * When value changes in the file input this method forward the value to the ag-grid,
 * which in tern forwards in to the valueSetter in corresponding column.
 * */
function onHandleUpdate(newHandle: ImportFileHandle | undefined) {
  props.params.setValue!(newHandle);
}

const currentProgress = computed(() => {
  return props.params.progress;
});
</script>

<template>
  <div>
    <PlFileInput
      show-filename-only
      clearable
      file-dialog-title="Select any file"
      :placeholder="`file.${extensions ? extensions[0] : ''}`"
      :extensions="extensions"
      :model-value="handle"
      :progress="currentProgress"
      @update:model-value="onHandleUpdate"
    />
  </div>
</template>
