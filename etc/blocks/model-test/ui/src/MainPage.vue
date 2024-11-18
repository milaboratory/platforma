<script setup lang="ts">
import { PlBlockPage, PlTextField } from '@platforma-sdk/ui-vue';
import { useApp } from './app';

const app = useApp();

</script>

<template>
  <PlBlockPage>
    <PlTextField label="Enter title" v-model:model-value="app.model.args.titleArg" />
  </PlBlockPage>
</template>
