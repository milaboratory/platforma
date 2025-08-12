<script setup lang="tsx">
import type { SpecUI } from '@milaboratories/milaboratories.file-import-block.model';
import type { LocalImportFileHandle } from '@milaboratories/pl-model-common';
import { useApp } from '../app';
import { useMetadataXsv } from '../hooks/useMetadataXsv';
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

const state = app.model.ui as typeof app.model.ui & {
  spec: SpecUI;
};
const metadata = useMetadataXsv(() => state.fileHandle as LocalImportFileHandle, () => state.spec.separator);
</script>

<template>
  <div :class="$style.specForm">
    <BasicSettings v-model="state.spec" />

    <div>
      <AxesConfiguration v-model="state.spec.axes" :metadata="metadata" />
      <ColumnsConfiguration v-model="state.spec.columns" :metadata="metadata" />
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
