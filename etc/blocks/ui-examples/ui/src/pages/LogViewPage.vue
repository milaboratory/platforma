<script setup lang="ts">
import {
  PlBlockPage,
  PlBtnGroup,
  PlBtnPrimary,
  PlCheckbox,
  PlLogView,
  PlRow,
  PlTextField,
  useInterval,
} from '@platforma-sdk/ui-vue';
import { faker } from '@faker-js/faker';
import { computed, reactive } from 'vue';
import { ensureErrorLike, type AnyLogHandle, type ValueOrErrors } from '@platforma-sdk/model';
import { listToOptions } from '@milaboratories/helpers';

const data = reactive({
  logContent: '',
  showError: false,
  text: 'my text',
  type: 'value' as 'value' | 'output' | 'handle',
  handle: 'log+ready://log/Blob/primary/1/1570892' as AnyLogHandle | undefined, // log+ready://log/Blob/primary/1/1570892
});

const options = listToOptions(['value', 'output', 'handle']);

const error = computed(() => (data.showError ? faker.lorem.paragraph() : undefined));

const output = computed<ValueOrErrors<string> | undefined>(() => {
  if (data.showError) {
    return {
      ok: false as const,
      errors: [ensureErrorLike('Error1'), ensureErrorLike('Error2')],
      moreErrors: false,
    };
  }

  return {
    ok: true as const,
    value: data.logContent,
  };
});

useInterval(() => {
  data.logContent += '\n';
  data.logContent += faker.lorem.paragraph();
}, 1000);

const dropHandle = () => {
  const handle = data.handle;
  data.handle = undefined;
  setTimeout(() => {
    data.handle = handle;
  }, 2000);
};
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>PlLogView</template>
    <PlRow>
      <PlCheckbox v-model="data.showError">Show error</PlCheckbox>
    </PlRow>
    <PlBtnGroup v-model="data.type" :options="options" />
    <template v-if="data.type === 'value'">
      <h4>Value and Error</h4>
      <PlLogView :value="data.logContent" :error="error" />
      <PlLogView :value="data.logContent" label="PlLogView label" :error="error" />
    </template>
    <template v-if="data.type === 'output'">
      <h4>Output (ValueOrErrors)</h4>
      <PlLogView :output="output" label="PlLogView label" />
    </template>
    <template v-if="data.type === 'handle'">
      <h4>LogHandle</h4>
      <PlTextField v-model="data.handle as string" label="Test Log Handle" />
      <PlBtnPrimary @click="dropHandle"> Drop handle </PlBtnPrimary>
      <PlLogView :log-handle="data.handle" label="PlLogView label" />
    </template>
  </PlBlockPage>
</template>
