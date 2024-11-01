<script setup lang="ts">
import { PlAlert, PlBlockPage, PlTextField, PlBtnPrimary } from '@platforma-sdk/ui-vue';
import { useApp } from '../app';
import { computed } from 'vue';

const app = useApp();

const numbers = computed({
  get() {
    return app.model.args.numbers.join(',');
  },
  set(v) {
    app.model.args.numbers = v
      .split(',')
      .filter((s) => s !== '')
      .map((s) => {
        const n = Number(s);
        return Number.isFinite(n) ? n : (s as unknown as number); // trigger error
      });
  }
});
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <PlTextField
      v-model:model-value="numbers"
      label="Enter numbers (as comma-separated string, non-numbers to trigger an error)"
    />
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
      {{ app.outputValues }}
    </PlAlert>
    <PlAlert type="info" monospace>
      outputs:
      {{ app.model.outputs }}
    </PlAlert>
    <PlAlert v-if="app.hasErrors" type="error">
      {{ app.outputErrors }}
    </PlAlert>
    <PlBtnPrimary v-if="app.error" @click="app.revert">Revert changes</PlBtnPrimary>
  </PlBlockPage>
</template>
