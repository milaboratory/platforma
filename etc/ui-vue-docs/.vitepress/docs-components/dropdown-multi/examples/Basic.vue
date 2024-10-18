<script setup lang="ts">
import { reactive } from 'vue';
import { PlCheckbox, PlDropdownMulti } from '@platforma-sdk/ui-vue';

const options = [
  { text: 'Item text 1', value: 1 },
  { text: 'Item text 2', value: 2 },
  { text: 'Item text 3', value: 3 },
  { text: 'Item text 4', value: 4 },
];

const data = reactive({
  model: [1, 2],
  required: false,
  disabled: false,
  showError: false,
  showHelper: false,
});
</script>

<template>
  <PlDropdownMulti
    v-model="data.model"
    :options="options"
    label="Label"
    placeholder="Select data"
    :required="data.required"
    :disabled="data.disabled"
    :error="data.showError ? 'An error example' : undefined"
    :helper="data.showHelper ? 'A helper example' : undefined"
  />
  <div class="d-flex gap-12">
    <PlCheckbox v-model="data.required">Required</PlCheckbox>
    <PlCheckbox v-model="data.disabled">Disabled</PlCheckbox>
    <PlCheckbox v-model="data.showError">Show error</PlCheckbox>
    <PlCheckbox v-model="data.showHelper">Show helper</PlCheckbox>
  </div>
</template>
