<script lang="ts" setup>
import { reactive } from 'vue';
import { SelectInput } from '@milaboratory/platforma-uikit.lib';
import { generate } from '@/imports';

const data = reactive({
  value: 1,
});

const options = generate(100, (i) => ({
  text: `Option ${i}`,
  value: i,
}));
</script>

<template>
  <select-input v-model="data.value" label="Label" :options="options" />
  <select-input v-model="data.value" label="Has tooltip" :options="options">
    <template #tooltip> Tooltip content Second line Third line </template>
  </select-input>
  <select-input v-model="data.value" label="Has error" :options="options" error="Some error description" />
</template>
