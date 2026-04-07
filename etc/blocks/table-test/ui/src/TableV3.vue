<script setup lang="ts">
import { PlAgDataTableV2, PlBlockPage, usePlDataTableSettingsV2 } from "@platforma-sdk/ui-vue";
import { useApp } from "./app";

const app = useApp();

const tableSettingsV3 = usePlDataTableSettingsV2({
  model: () => app.model.outputs.tableV3,
});
</script>

<template>
  <PlBlockPage>
    <template #title>Table V3 (Latest)</template>
    <PlAgDataTableV2 v-model="app.model.data.tableState" :settings="tableSettingsV3" />
  </PlBlockPage>
</template>
