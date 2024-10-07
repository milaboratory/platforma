<script setup lang="ts">
import { PlBlockPage, PlCheckbox, PlLogView, PlRow, useInterval } from '@platforma-sdk/ui-vue';
import { faker } from '@faker-js/faker';
import { computed, reactive } from 'vue';
import type { ValueOrErrors } from '@platforma-sdk/model';

const data = reactive({
  logContent: '',
  showError: false,
  text: 'my text'
});

const error = computed(() => (data.showError ? faker.lorem.paragraph() : undefined));

const output = computed<ValueOrErrors<string> | undefined>(() => {
  if (data.showError) {
    return {
      ok: false as const,
      errors: ['Error1', 'Error2'],
      moreErrors: false
    };
  }

  return {
    ok: true as const,
    value: data.logContent
  };
});

useInterval(() => {
  data.logContent += '\n';
  data.logContent += faker.lorem.paragraph();
}, 1000);
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>PlLogView</template>
    <PlRow>
      <PlCheckbox v-model="data.showError">Show error</PlCheckbox>
    </PlRow>
    <h4>Value and Error</h4>
    <PlLogView :value="data.logContent" :error="error" />
    <h4>Output (ValueOrErrors)</h4>
    <PlLogView :output="output" />
  </PlBlockPage>
</template>
