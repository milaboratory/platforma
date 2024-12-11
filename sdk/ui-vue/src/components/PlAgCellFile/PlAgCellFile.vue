<script setup lang="ts">
import { PlFileInput } from '@milaboratories/uikit';
import type { ICellRendererParams } from 'ag-grid-enterprise';
import type { ImportFileHandle, ImportProgress } from '@platforma-sdk/model';
import { computed } from 'vue';

const props = defineProps<{
  // this component is intended to be used in ag-grid, params are the main object
  // to communicate with the corresponding cell data
  params: ICellRendererParams<unknown, ImportFileHandle> & {
    extensions?: string[];
    progress?: ImportProgress;
    /**
     * The resolveProgress function is an optional input parameter for the component
     * that allows tracking the file upload progress in real-time.
     * By passing resolveProgress, you can ensure that the component
     * displays accurate progress values for each file as they upload.
     * How to use it in AgGrid
     * cellRendererParams: {
     *  resolveProgress: (fileHandle: ImportFileHandle | undefined) => {
     *    const progresses = app.progresses;
     *    if (!fileHandle) return undefined;
     *    else return progresses[fileHandle];
     *  }
     * }
     */
    resolveProgress?: (v: ImportFileHandle | undefined) => ImportProgress | undefined;
  };
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
  return props.params.resolveProgress ? props.params.resolveProgress(handle.value) : undefined;
});
</script>

<template>
  <div style="height: 100%">
    <PlFileInput
      show-filename-only
      clearable
      cell-style
      file-dialog-title="Select any file"
      :placeholder="`Choose file ${extensions ? extensions[0] : ''}`"
      :extensions="extensions"
      :model-value="handle"
      :progress="currentProgress"
      @update:model-value="onHandleUpdate"
    />
  </div>
</template>
