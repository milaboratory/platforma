<script setup lang="ts">
import { PlBlockPage, PlTextField } from "@platforma-sdk/ui-vue";
import { useApp } from "./app";

const app = useApp();
</script>

<template>
  <PlBlockPage>
    <PlTextField v-model="app.model.data.label" label="Label" />

    <details open>
      <summary>Workflow Output (tableContent)</summary>
      <pre>{{ app.model.outputs.tableContent }}</pre>
    </details>
  </PlBlockPage>
</template>
