<script setup lang="ts">
import { PlAlert, PlBlockPage, PlDropdownMulti } from '@platforma-sdk/ui-vue';
import { useApp } from './app';
import { computed } from 'vue';

const app = useApp();

const sources = computed({
  get() {
    return app.model.args.sources ?? [];
  },
  set(newValue) {
    app.model.args.sources = newValue;
  }
});
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <PlDropdownMulti
      :options="app.model.outputs.opts ?? []"
      v-model="sources"
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
      <legend>Args (app.snapshot.args)</legend>
      {{ app.snapshot.args }}
    </fieldset>
    <fieldset>
      <legend>Args (app.model.args)</legend>
      {{ app.model.args }}
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
    <PlAlert type="error" v-if="app.hasErrors">
      {{ app.model.outputErrors }}
    </PlAlert>
  </PlBlockPage>
</template>
