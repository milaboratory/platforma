<script setup lang="ts">
import { PlAgDataTableV2, PlBlockPage, usePlDataTableSettingsV2 } from "@platforma-sdk/ui-vue";
import { useApp } from "./app";

const app = useApp();

const tableSettings = usePlDataTableSettingsV2({
  model: () => app.model.outputs.tableSplitV3,
});
</script>

<template>
  <PlBlockPage>
    <template #title>Table split-by-partition</template>
    <PlAgDataTableV2
      v-model="app.model.data.tableSplitState"
      :settings="tableSettings"
      show-export-button
    />
  </PlBlockPage>
</template>
