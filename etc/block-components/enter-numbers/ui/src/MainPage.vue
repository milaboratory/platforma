<script setup lang="ts">
import { PlAlert, PlBlockPage, PlTextField, PlBtnPrimary } from '@platforma-sdk/ui-vue';
import { useApp } from './app';
import { computed } from 'vue';

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
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <PlTextField label="Enter numbers (as comma-separated string)" v-model:model-value="numbers" />
    <PlAlert v-if="app.error" type="error">
      {{ app.error }}
    </PlAlert>
    <fieldset>
      <legend>Args (snapshot)</legend>
      {{ app.args  }}
    </fieldset>  
    <fieldset>
      <legend>Args (model)</legend>
      {{ app.model.args }}
    </fieldset>  
    <h3>Outputs</h3>
    <code>{{ app.outputValues }}</code>
    <PlAlert type="error" v-if="app.hasErrors">
      {{ app.outputErrors }}
    </PlAlert>
    <PlBtnPrimary v-if="app.error" @click="app.revert">Revert changes</PlBtnPrimary>
  </PlBlockPage>
</template>
