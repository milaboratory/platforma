<script setup lang="ts">
import { PlBlockPage, PlLogView, useInterval } from '@platforma-sdk/ui-vue';
import { faker } from '@faker-js/faker';
import { reactive } from 'vue';

const data = reactive({
  logContent: ''
});

useInterval(() => {
  data.logContent += '\n';
  data.logContent += faker.lorem.paragraph();
}, 1000);
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>PlLogView</template>
    <PlLogView :value="data.logContent" />
  </PlBlockPage>
</template>
