<script setup lang="ts">
import { PlBlockPage, PlFileInput } from '@platforma-sdk/ui-vue';
import { useApp } from './app';
import Spec from './components/Spec.vue';

const app = useApp();

</script>

<template>
  <PlBlockPage>
    <template #title>
      File Import
    </template>

    <PlFileInput
      v-model="app.model.args.fileHandle"
      label="File csv/tsv"
      :extensions="['.csv', '.tsv']"
      :progress="app.model.outputs.fileUploadProgress"
    />

    <Spec />
  </PlBlockPage>
</template>
