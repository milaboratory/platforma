<script setup lang="tsx">
import type { SpecUI } from '@milaboratories/milaboratories.file-import-block.model';
import { watch } from 'vue';
import { useApp } from './app';
import AxesConfiguration from './components/AxesConfiguration.vue';
import BasicSettings from './components/BasicSettings.vue';
import ColumnsConfiguration from './components/ColumnsConfiguration.vue';
import { prepareSpec } from './utils/spec';

const app = useApp();

if (app.model.ui.spec === undefined) {
  app.model.ui.spec = {
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
  } satisfies SpecUI;
}

const state = app.model.ui.spec;

// Watch for changes and update app.model.args.spec
watch(state, (newValue) => {
  // app.model.ui.spec = newValue;
  app.model.args.spec = prepareSpec(newValue);
}, { deep: true });

</script>

<template>
  <div :class="$style.specForm">
    <BasicSettings v-model="state" />

    <div>
      <AxesConfiguration v-model="state.axes" />
      <ColumnsConfiguration v-model="state.columns" />
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