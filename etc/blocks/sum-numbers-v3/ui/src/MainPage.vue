<script setup lang="ts">
import { PlAlert, PlBlockPage, PlDropdownMulti } from '@platforma-sdk/ui-vue';
import { useApp } from './app';
import { computed } from 'vue';

const app = useApp();

const sources = computed({
  get() {
    return app.model.data.sources ?? [];
  },
  set(newValue) {
    app.model.data.sources = newValue;
  },
});
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <PlDropdownMulti
      v-model="sources"
      :options="app.model.outputs.opts ?? []"
      label="Select numbers"
    />

    <PlAlert type="success">
      Sum:
      {{ app.model.outputs.sum }}
    </PlAlert>

    <PlAlert v-if="app.error" type="error">
      {{ app.error }}
    </PlAlert>
    <fieldset>
      <legend>Block Storage (app.snapshot.blockStorage)</legend>
      {{ app.snapshot.blockStorage }}
    </fieldset>
    <h3>app.model</h3>
    <code>{{ app.model }}</code>
    <PlAlert type="info" monospace>
      outputValues:
      {{ app.model.outputs }}
    </PlAlert>
    <PlAlert type="info" monospace>
      outputs:
      {{ app.model.outputs }}
    </PlAlert>
    <PlAlert v-if="app.hasErrors" type="error">
      {{ app.model.outputErrors }}
    </PlAlert>
  </PlBlockPage>
</template>
