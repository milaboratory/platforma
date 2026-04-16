<script setup lang="ts">
import { PlAlert, PlBlockPage, PlDatasetSelector } from "@platforma-sdk/ui-vue";
import { useApp } from "./app";
import { computed } from "vue";

const app = useApp();

const dataset = computed({
  get() {
    return app.model.data.dataset;
  },
  set(newValue) {
    app.model.data.dataset = newValue;
  },
});
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <PlDatasetSelector
      v-model="dataset"
      :options="app.model.outputs.datasetOptions"
      label="Dataset"
      filter-label="Filter"
    />

    <PlAlert v-if="app.model.outputs.tableContent" type="success" monospace>
      {{ app.model.outputs.tableContent }}
    </PlAlert>

    <PlAlert type="info" monospace> Block data: {{ app.model.data }} </PlAlert>

    <PlAlert v-if="app.hasErrors" type="error">
      {{ app.model.outputErrors }}
    </PlAlert>
  </PlBlockPage>
</template>
