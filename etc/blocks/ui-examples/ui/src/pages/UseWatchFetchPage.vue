<script setup lang="ts">
import { PlBlockPage, PlNumberField, PlTextField, useWatchFetch } from '@platforma-sdk/ui-vue';
import { reactive } from 'vue';
import { fetchTestResult } from './fetchTestResult';

const data = reactive({
  number: 0,
  text: '',
});

const numberRef = useWatchFetch(
  () => data.number,
  (n) => {
    return fetchTestResult(n);
  },
);

// number | undefined
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
numberRef.value;

const stringRef = useWatchFetch(
  () => data,
  (n) => {
    return fetchTestResult(n.number, n.text);
  },
);

// string | undefined
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
stringRef.value;
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>UseWatchFetch</template>
    <PlNumberField
      v-model="data.number"
      label="Num (if num is divided by 5 fetch throws an exception)"
    />
    <PlTextField
      v-model="data.text"
      label="Text (`h` at the end of the string causes an exception))"
    />
    <pre>{{ numberRef }}</pre>
    <pre>{{ stringRef }}</pre>
  </PlBlockPage>
</template>
