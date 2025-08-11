<script setup lang="ts">
import type { LocalImportFileHandle } from '@milaboratories/pl-model-common';
import { PlBlockPage, PlFileInput } from '@platforma-sdk/ui-vue';
import { isNil } from 'es-toolkit';
import { watch } from 'vue';
import { useApp } from './app';
import Spec from './components/Spec.vue';
import { parseLocalXsvFile } from './hooks/useMetadataXsv';

const app = useApp();

app.model.args.fileExt = 'csv';

watch([() => app.model.args.fileHandle, () => app.model.ui.spec], () => {
  const handle = app.model.args.fileHandle;
  const spec = app.model.ui.spec;
  if (isNil(handle) || isNil(spec)) return;

  parseLocalXsvFile({
    fileHandle: handle as LocalImportFileHandle,
    separator: spec.separator ?? ',',
  });
}, { immediate: true });

</script>

<template>
  <PlBlockPage>
    <h2>File Import Specification</h2>

    <PlFileInput
      v-model="app.model.args.fileHandle"
      label="File csv/tsv"
      :extensions="['.csv', '.tsv']"
      :progress="app.model.outputs.fileUploadProgress"
    />

    <Spec />
  </PlBlockPage>
</template>
