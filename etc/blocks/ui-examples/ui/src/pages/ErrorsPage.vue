<script setup lang="ts">
import { PlAlert, PlBlockPage, PlTextField, PlBtnPrimary, PlRow } from '@platforma-sdk/ui-vue';
import { useApp } from '../app';
import { computed, reactive } from 'vue';

const app = useApp();

const data = reactive({
  progressDurationMs: 10000,
});

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
  },
});

const $ = {
  positiveNumber: (v: string) => {
    const parsed = Number(v);

    if (!Number.isFinite(parsed)) {
      throw Error('Not a number');
    }

    if (parsed <= 0) {
      throw Error('Enter positive value');
    }

    return parsed;
  },
};
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
      <legend>Args snapshot (app.snapshot.args)</legend>
      {{ app.snapshot.args }}
    </fieldset>
    <fieldset>
      <legend>Args (model) (app.model.args)</legend>
      {{ app.model.args }}
    </fieldset>
    <PlAlert label="Outputs" type="info" monospace pre>
      {{ app.model.outputs }}
    </PlAlert>
    <PlAlert label="Output Errors 1" type="error" monospace pre>
      {{ app.model.outputErrors }}
    </PlAlert>
    <PlRow>
      <PlBtnPrimary @click="() => app.showInfiniteProgress(data.progressDurationMs)">
        Show loader
      </PlBtnPrimary>
      <PlBtnPrimary @click="() => app.showProgress(data.progressDurationMs)">
        Show progress
      </PlBtnPrimary>
      <PlTextField
        v-model="data.progressDurationMs"
        label="Progress duration (ms)"
        :parse="$.positiveNumber"
      />
    </PlRow>
  </PlBlockPage>
</template>
