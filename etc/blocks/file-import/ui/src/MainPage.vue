<script setup lang="ts">
import { PlBlockPage, PlFileInput } from '@platforma-sdk/ui-vue';
import { useApp } from './app';
import Spec from './Spec.vue';

const app = useApp();

app.model.args.fileExt = 'csv';

</script>

<template>
  <PlBlockPage>
    <h2>File Import Specification</h2>

    <PlFileInput label="File csv/tsv" v-model="app.model.args.fileHandle" :extensions="['.csv', '.tsv']"
      :progress="app.model.outputs.fileUploadProgress" />

    <Spec />
  </PlBlockPage>
</template>
