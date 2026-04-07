<script setup lang="ts">
import { PlAgDataTableV2, PlBlockPage, usePlDataTableSettingsV2 } from "@platforma-sdk/ui-vue";
import { useApp } from "./app";

const app = useApp();

const tableSettingsV2 = usePlDataTableSettingsV2({
  model: () => app.model.outputs.tableV2,
});
</script>

<template>
  <PlBlockPage>
    <template #title>Table V2</template>
    <PlAgDataTableV2 v-model="app.model.data.tableState" :settings="tableSettingsV2" />
  </PlBlockPage>
</template>
