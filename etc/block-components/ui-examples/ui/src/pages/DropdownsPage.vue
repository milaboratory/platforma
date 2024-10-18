<script setup lang="ts">
import { PlBlockPage, PlCheckbox, PlDropdown, PlDropdownRef, PlRow } from '@platforma-sdk/ui-vue';
import { reactive } from 'vue';

const data = reactive({
  disabled: false,
  clearable: true,
  model: 1,
  ref: undefined
});

const simpleOptions = [
  {
    label: 'One',
    value: 1
  },
  {
    label: 'Two',
    value: 2
  },
  {
    text: 'Three',
    value: 3
  },
  {
    text: 'NaN',
    value: NaN
  }
];

const refOptions = [
  {
    label: 'Block 1 label',
    ref: {
      __isRef: true as const,
      blockId: '1',
      name: 'Block 1'
    }
  },
  {
    label: 'Block 2 label',
    ref: {
      __isRef: true as const,
      blockId: '2',
      name: 'Block 2'
    }
  }
];
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <PlRow>
      <PlCheckbox v-model="data.disabled">Disabled</PlCheckbox>
      <PlCheckbox v-model="data.clearable">Clearable</PlCheckbox>
    </PlRow>
    <PlDropdown
      v-model="data.model"
      :disabled="data.disabled"
      :clearable="data.clearable"
      label="PlDropdown"
      :options="simpleOptions"
    />
    <PlDropdownRef
      v-model="data.ref"
      :disabled="data.disabled"
      :clearable="data.clearable"
      label="PlDropdownRef"
      :options="refOptions"
    />
    <pre>{{ data }}</pre>
  </PlBlockPage>
</template>
