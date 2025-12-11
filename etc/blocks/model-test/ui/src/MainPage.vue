<script setup lang="ts">
import { PlBlockPage, PlTextField } from '@platforma-sdk/ui-vue';
import { useApp } from './app';

const app = useApp();

</script>

<template>
  <PlBlockPage>
    <PlTextField v-model:model-value="app.model.args.titleArg" label="Enter title" />
  </PlBlockPage>
</template>
