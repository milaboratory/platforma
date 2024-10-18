<script setup lang="ts">
import { reactive } from 'vue';
import {
  PlCheckboxGroup,
  PlToggleSwitch,
} from '@platforma-sdk/ui-vue';

const data = reactive({
  model: [] as number[],
  disabled: false as boolean,
});

const options = [
  {
    text: 'Option 1',
    value: 1,
  },
  {
    text: 'Option 2',
    value: 2,
  },
  {
    text: 'Option 3',
    value: 3,
  },
  {
    text: 'Option 4',
    value: 4,
  },
];
</script>

<template>
  <div class="checkbox-group-basic">
    <div class="mb-10">
      <PlToggleSwitch
        v-model="data.disabled"
        label="Disable checkbox group"
      />
    </div>
    <p>
      <strong>data.model:</strong>
      {{ data.model }}
    </p>
    <PlCheckboxGroup
      v-model="data.model"
      :options="options"
      :disabled="data.disabled"
    />
  </div>
</template>

<style>
.checkbox-group-basic {
  color: var(--txt-01);
}
</style>
