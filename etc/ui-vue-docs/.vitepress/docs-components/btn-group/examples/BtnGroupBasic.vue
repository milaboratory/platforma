<script setup lang="ts">
import { PlBtnGroup, PlCheckbox } from '@platforma-sdk/ui-vue';
import { reactive } from 'vue';

const options = [
  { text: 'Option 1', value: 1 },
  { text: 'Option 2', value: 2 },
  { text: 'Option 3', value: 3 },
];

const data = reactive({
  model: 1,
  disabled: false,
});
</script>

<template>
  <PlBtnGroup
    v-model="data.model"
    :options="options"
    :disabled="data.disabled"
  />
  <PlCheckbox v-model="data.disabled">Disable</PlCheckbox>
</template>
