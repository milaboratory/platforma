<script setup lang="ts">
import { PlAlert, PlBlockPage, PlLogView, PlTextField, useInterval } from '@platforma-sdk/ui-vue';
import { useApp } from './app';
import { z } from 'zod';
import { faker } from '@faker-js/faker';
import { reactive } from 'vue';

const data = reactive({
  logContent: ''
});

const $Transformed = z.object({
  numbers: z.string()
});

const app = useApp();

const args = app.createArgsModel({  
  transform(argsValue) {
    return {numbers: argsValue.numbers.join(',')}
  },
  validate(v) {
    const t = $Transformed.parse(v);
    const numbers = t.numbers.split(',').map(v => v ? Number(v) : NaN);

    if (numbers.some(isNaN)) {
      throw Error('Numbers contain NaNs');
    }

    return {numbers};
  }
});

useInterval(() => {
  data.logContent += '\n';
  data.logContent += faker.lorem.paragraph();
}, 1000);

const VITE_PLATFORMA_AG_LICENSE = window.getEnvironmentValue('VITE_PLATFORMA_AG_LICENSE');
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <PlTextField label="Enter numbers (as comma-separated string)" v-model:model-value="args.model.numbers" />
    <PlAlert v-if="args.error" type="error">
      {{ args.error }}
    </PlAlert>  
    <h3>Args</h3>
    VITE_PLATFORMA_AG_LICENSE: {{ VITE_PLATFORMA_AG_LICENSE }}
    <code>
      {{ args.model  }}
    </code>

    <h1>My Logs</h1>
    <PlLogView v-if="true" :value="data.logContent" />
  </PlBlockPage>
</template>
