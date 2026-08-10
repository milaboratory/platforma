<script setup lang="ts">
import { PlAlert, PlBlockPage, PlTextField, PlFileInput } from "@platforma-sdk/ui-vue";
import { useApp } from "./app";
import { computed } from "vue";

const app = useApp();

const progress = computed(() => {
  const handle = app.snapshot.outputs.handle;

  if (!handle) return undefined;

  if (!handle.ok) return undefined;

  return handle.value;
});
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <PlFileInput
      v-model="app.model.data.inputHandle"
      label="Select file to import"
      :progress="progress"
    />

    <PlTextField
      v-model="app.model.data.readFileWithSleepArgs"
      label="Write arguments splitted by comma (no spaces)"
    />

    <PlAlert type="success"> Last Logs: {{ app.model.outputs.lastLogs }} </PlAlert>

    <PlAlert type="success"> Progress Log: {{ app.model.outputs.progressLog }} </PlAlert>

    <PlAlert type="success"> Log Handle: {{ app.model.outputs.logHandle }} </PlAlert>

    <PlAlert v-if="app.error" type="error">
      {{ app.error }}
    </PlAlert>

    <fieldset>
      <legend>Block storage (app.snapshot.blockStorage)</legend>
      {{ app.snapshot.blockStorage }}
    </fieldset>

    <fieldset>
      <legend>Data (app.model.data)</legend>
      {{ app.model.data }}
    </fieldset>

    <PlAlert label="app.model" type="info" monospace max-height="400px">
      {{ app.model }}
    </PlAlert>

    <PlAlert label="Outputs" type="info" monospace max-height="400px">
      {{ app.model.outputs }}
    </PlAlert>

    <PlAlert v-if="app.hasErrors" label="Output Errors" type="error" max-height="400px">
      {{ app.model.outputErrors }}
    </PlAlert>
  </PlBlockPage>
</template>
