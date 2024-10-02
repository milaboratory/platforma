<script setup lang="ts">
import { PlAlert, PlBlockPage, PlNumberField, PlTextArea, PlTextField } from '@platforma-sdk/ui-vue';
import { useApp } from './app';
import { z } from 'zod';

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
    const numbers = t.numbers.split(',').map(Number);

    if (numbers.some(isNaN)) {
      throw Error('Numbers contain NaNs')
    }

    return {numbers};
  }
});
</script>

<template>
  <PlBlockPage>
    <PlTextField label="Enter numbers (as comma-separated string)" v-model:model-value="args.model.numbers" />
    <PlAlert v-if="args.error" type="error">
      {{ args.error }}
    </PlAlert>  
    <h3>Args</h3>
    <code>
      {{ args.model  }}
    </code>
  </PlBlockPage>
</template>
