<script setup lang="ts">
import { PlAlert, PlBlockPage, PlTextField, PlBtnPrimary, useWatchFetch } from '@platforma-sdk/ui-vue';
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

    app.model.args.numbers = v.split(',').map(Number);

    if (numbers.some(n => isNaN(n))) {
      app.setError('Invalid value: contains NaNs +++');
    }
  }
});

const fetchTestResult = async (n: number) => {
  await delay(1000);
  return n;
};

const sumNumbers = (numbers: number[] | undefined) => (numbers ?? []).reduce((x, y) => x + y);

const resultRef = useWatchFetch(() => app.model.outputs.numbers, (numbers) => {
  return fetchTestResult(sumNumbers(numbers));
});
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <PlTextField label="Enter numbers (as comma-separated string)" v-model:model-value="numbers" />
    <PlAlert v-if="app.error" type="error">
      {{ app.error }}
    </PlAlert>
    <fieldset>
      <legend>Args (app.snapshot.args)</legend>
      {{ app.snapshot.args  }}
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
    <PlAlert label="app.model.outputs" type="info" monospace>
      {{ app.model.outputs }}
    </PlAlert>
    <PlAlert type="info" monospace>
      outputs:
      {{ app.model.outputs }}
    </PlAlert>
    <PlAlert type="error" v-if="app.hasErrors">
      {{ app.model.outputErrors }}
    </PlAlert>
    <PlBtnPrimary v-if="app.error" @click="app.revert">Revert changes</PlBtnPrimary>
  </PlBlockPage>
</template>
