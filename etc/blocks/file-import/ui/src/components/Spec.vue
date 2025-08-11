<script setup lang="tsx">
import type { SpecUI } from '@milaboratories/milaboratories.file-import-block.model';
import type { LocalImportFileHandle } from '@milaboratories/pl-model-common';
import { watch } from 'vue';
import { useApp } from '../app';
import { useMetadataXsv } from '../hooks/useMetadataXsv';
import { prepareSpec } from '../utils/spec';
import AxesConfiguration from './AxesConfiguration.vue';
import BasicSettings from './BasicSettings.vue';
import ColumnsConfiguration from './ColumnsConfiguration.vue';

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
    columns: [],
  } satisfies SpecUI;
}

const args = app.model.args;
const state = app.model.ui.spec;
const metadata = useMetadataXsv(() => args.fileHandle as LocalImportFileHandle, () => state.separator);
// Watch for changes and update app.model.args.spec
watch(state, (newValue) => {
  app.model.args.spec = prepareSpec(newValue);
}, { deep: true });

</script>

<template>
  <div :class="$style.specForm">
    <BasicSettings v-model="state" />

    <div>
      <AxesConfiguration v-model="state.axes" :metadata="metadata" />
      <ColumnsConfiguration v-model="state.columns" :metadata="metadata" />
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
