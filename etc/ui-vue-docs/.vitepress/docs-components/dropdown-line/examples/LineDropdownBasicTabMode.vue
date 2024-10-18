<script setup lang="ts">
import { reactive, ref } from 'vue';
import { PlDropdownLine } from '@platforma-sdk/ui-vue';

const data = reactive({
  label: 'Label text',
  placeholder: 'Placeholder',
  options: [
    { text: 'Item text 1', value: 1 },
    { text: 'Item text 2', value: 2 },
    { text: 'Item text 3', value: 3 },
    { text: 'Item text 4', value: 4 },
  ],
});
const model = ref(data.options[0].value);
</script>

<template>
  <PlDropdownLine
    v-model="model"
    :options="data.options"
    :label="data.label"
    :placeholder="data.placeholder"
    mode="tabs"
    clearable
  />
</template>
