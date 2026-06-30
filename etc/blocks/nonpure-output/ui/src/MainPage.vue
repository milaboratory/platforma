<script setup lang="ts">
import { PlAlert, PlBlockPage } from "@platforma-sdk/ui-vue";
import { useApp } from "./app";

const app = useApp();
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <PlAlert type="info" monospace>
      Non-pure output (changes on every run):
      {{ app.model.outputs.nonpureValue }}
    </PlAlert>

    <PlAlert v-if="app.error" type="error">
      {{ app.error }}
    </PlAlert>
  </PlBlockPage>
</template>
