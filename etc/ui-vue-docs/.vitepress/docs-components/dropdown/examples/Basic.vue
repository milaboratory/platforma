<script setup lang="ts">
import { reactive } from 'vue';
import { PlDropdown, PlCheckbox } from '@platforma-sdk/ui-vue';

// It can be static or reactive, depending on your goals.
// Note that if the parameter value is not primitive, deep equality is used to determine the selected parameter.
const options = [
  { text: 'Item text 1', value: 1 },
  { text: 'Item text 2', value: 2 },
  { text: 'Item text 3', value: 3 },
  { text: 'Item text 4', value: 4 },
];

const data = reactive({
  model: 1 as number | undefined,
  required: false,
  disabled: false,
  showError: false,
  showHelper: false,
  clearable: false,
});
</script>

<template>
  <PlDropdown
    v-model="data.model"
    :options="options"
    label="Dropdown Label"
    placeholder="Select an option"
    :clearable="data.clearable"
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
    <PlCheckbox v-model="data.clearable">Clearable</PlCheckbox>
  </div>
</template>
