<script setup lang="ts">
import {
  PlAlert,
  PlBlockPage,
  PlTextField,
  PlBtnPrimary,
  useWatchFetch,
} from "@platforma-sdk/ui-vue";
import { useApp } from "./app";
import { computed } from "vue";
import { delay } from "@milaboratories/helpers";

const app = useApp();

const numbers = computed({
  get() {
    try {
      return app.model.data.numbers.join(",");
    } catch (error) {
      return "error: " + error;
    }
  },
  set(v) {
    const numbers = v.split(",").map(Number);

    app.model.data.numbers = v
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v !== "")
      .map(Number);

    if (numbers.some((n) => isNaN(n))) {
      app.setError("Invalid value: contains NaNs +++");
    }
  },
});

const fetchTestResult = async (n: number) => {
  await delay(1000);
  return n;
};

const sumNumbers = (numbers: number[] | undefined) => (numbers ?? []).reduce((x, y) => x + y, 0);

const resultRef = useWatchFetch(
  () => app.model.outputs.numbers,
  (numbers) => {
    return fetchTestResult(sumNumbers(numbers));
  },
);

const helperText = computed(() => {
  return `Even numbers count: ${app.model.outputs.numbersCount}`;
});
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <PlTextField
      v-model:model-value="numbers"
      label="Enter numbers (as comma-separated string)"
      :helper="helperText"
    />
    <PlAlert v-if="app.error" type="error">
      {{ app.error }}
    </PlAlert>
    <fieldset>
      <legend>app.model</legend>
      {{ app.model }}
    </fieldset>
    <fieldset>
      <legend>Block Storage (app.snapshot.blockStorage)</legend>
      {{ app.snapshot.blockStorage }}
    </fieldset>
    <h4>Result ref</h4>
    <code>{{ resultRef }}</code>
    <PlAlert label="app.model.outputs" type="info" white-space-pre monospace>{{
      JSON.stringify(app.model.outputs, null, 2)
    }}</PlAlert>
    <PlAlert v-if="app.hasErrors" type="error">
      {{ app.model.outputErrors }}
    </PlAlert>
    <PlBtnPrimary v-if="app.error" @click="app.revert">Revert changes</PlBtnPrimary>
  </PlBlockPage>
</template>
