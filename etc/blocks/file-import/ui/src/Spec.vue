<script setup lang="tsx">
import type { Spec } from '@milaboratories/milaboratories.file-import-block.model';
import { ref, watch } from 'vue';
import { useApp } from './app';
import AxesConfiguration from './components/AxesConfiguration.vue';
import BasicSettings from './components/BasicSettings.vue';
import ColumnsConfiguration from './components/ColumnsConfiguration.vue';
import { prepareSpec } from './utils/spec';

const app = useApp();

// Initialize reactive data
const formData = ref<Spec>({
  separator: ',',
  commentLinePrefix: undefined,
  skipEmptyLines: false,
  allowColumnLabelDuplicates: true,
  allowArtificialColumns: false,
  columnNamePrefix: undefined,
  storageFormat: 'Binary',
  partitionKeyLength: 0,
  index: undefined,
  axes: [],
  columns: []
});


// Watch for changes and update app.model.args.spec
watch(formData, (newValue) => {
  app.model.args.spec = prepareSpec(newValue);
}, { deep: true });

// Initialize from existing spec if available
if (app.model.args.spec) {
  formData.value = {
    separator: app.model.args.spec.separator || ',',
    commentLinePrefix: app.model.args.spec.commentLinePrefix,
    skipEmptyLines: app.model.args.spec.skipEmptyLines || false,
    allowColumnLabelDuplicates: app.model.args.spec.allowColumnLabelDuplicates !== false,
    allowArtificialColumns: app.model.args.spec.allowArtificialColumns || false,
    columnNamePrefix: app.model.args.spec.columnNamePrefix,
    storageFormat: app.model.args.spec.storageFormat || 'Binary',
    partitionKeyLength: app.model.args.spec.partitionKeyLength || 0,
    index: app.model.args.spec.index,
    axes: app.model.args.spec.axes || [],
    columns: app.model.args.spec.columns || []
  };
}
</script>

<template>
  <div :class="$style.specForm">
    <BasicSettings v-model="formData" />

    <div>
      <AxesConfiguration v-model="formData.axes" />
      <ColumnsConfiguration v-model="formData.columns" />
    </div>
  </div>
</template>

<style module>
.specForm {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>