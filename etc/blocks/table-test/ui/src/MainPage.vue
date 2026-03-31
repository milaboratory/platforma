<script setup lang="ts">
import { PlAgDataTableV2, PlBlockPage, usePlDataTableSettingsV2 } from "@platforma-sdk/ui-vue";
import { useApp } from "./app";

const app = useApp();

const tableSettings = usePlDataTableSettingsV2({
  model: () => app.model.outputs.table,
});
</script>

<template>
  <PlBlockPage>
    <template #title>Table Test, Don't forget to run the block =)</template>
    <PlAgDataTableV2 v-model="app.model.data.tableState" :settings="tableSettings" />
  </PlBlockPage>
</template>
