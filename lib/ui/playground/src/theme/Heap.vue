<script lang="ts" setup>
import { reactive } from 'vue';
import { PlDropdown } from '@milaboratories/uikit';
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
  <PlDropdown v-model="data.value" label="Label" :options="options" />
  <PlDropdown v-model="data.value" label="Has tooltip" :options="options">
    <template #tooltip> Tooltip content Second line Third line </template>
  </PlDropdown>
  <PlDropdown v-model="data.value" label="Has error" :options="options" error="Some error description" />
</template>
