<script setup lang="ts">
import { PlAlert, PlBlockPage, PlTextField, useWatchFetch } from '@platforma-sdk/ui-vue';
import { useApp } from './app';
import { computed } from 'vue';
import { delay } from '@milaboratories/helpers';

const app = useApp();

const numbers = computed({
  get() {
    return app.model.args.numbers.join(',');
  },
  set(v) {
    const numbers = v.split(',').map(Number);

    app.model.args.numbers = v.split(',').map((v) => v.trim()).filter((v) => v !== '').map(Number);

    if (numbers.some((n) => isNaN(n))) {
      app.setError('Invalid value: contains NaNs +++');
    }
  },
});

const fetchTestResult = async (n: number) => {
  await delay(1000);
  return n;
};

const sumNumbers = (numbers: number[] | undefined) => (numbers ?? []).reduce((x, y) => x + y, 0);

const resultRef = useWatchFetch(() => app.model.outputs.numbers, (numbers) => {
  return fetchTestResult(sumNumbers(numbers));
});
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <PlTextField v-model:model-value="numbers" label="Enter numbers (as comma-separated string)" />
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
    <fieldset>
      <legend>Args (app.snapshot.args deprecated)</legend>
      ----
    </fieldset>
    <h3>app.model</h3>
    <code>{{ app.model }}</code>
    <h4>Result ref</h4>
    <code>{{ resultRef }}</code>
    <PlAlert label="app.model.outputs!!!" type="info" white-space-pre monospace>{{ JSON.stringify(app.model.outputs, null, 2) }}</PlAlert>
    <PlAlert v-if="app.hasErrors" type="error">
      {{ app.model.outputErrors }}
    </PlAlert>
  </PlBlockPage>
</template>
