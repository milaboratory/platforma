<script setup lang="ts">
import { PlBlockPage, PlRadio, PlRadioGroup, PlRow } from '@platforma-sdk/ui-vue';
import { ref } from 'vue';

const standaloneValue = ref<string>();
const groupValue = ref<string>();
const groupWithOptionsValue = ref<string>();
</script>

<template>
  <PlBlockPage>
    <template #title>Tabs</template>
    <PlRow>
      <div :class="$style.container">
        <h1>Standalone</h1>
        <PlRadio v-model="standaloneValue" value="option-1" name="standalone">Option 1</PlRadio>
        <PlRadio v-model="standaloneValue" value="option-2" name="standalone">Option 2</PlRadio>
        <PlRadio v-model="standaloneValue" value="option-3" name="standalone" disabled>Option 3 (disabled)</PlRadio>
        <output>Current value: {{ standaloneValue ?? "<unset>" }}</output>
      </div>
    </PlRow>
    <PlRow>
      <div :class="$style.container">
        <h1>Grouped</h1>
        <PlRadioGroup v-model="groupValue" name="group">
          <template #label>Group Label</template>
          <PlRadio value="option-1">Option 1</PlRadio>
          <PlRadio value="option-2">Option 2</PlRadio>
          <PlRadio value="option-3" disabled>Option 3 (disabled)</PlRadio>
        </PlRadioGroup>
        <output>Current value: {{ groupValue ?? "<unset>" }}</output>
      </div>
    </PlRow>
    <PlRow>
      <div :class="$style.container">
        <h1>Grouped, with <code :style="{ fontSize: 'inherit' }">options</code> prop</h1>
        <PlRadioGroup
          v-model="groupWithOptionsValue" name="groupWithOptions" :options="[
            { value: 'option-1', label: 'Option 1' },
            { value: 'option-2', label: 'Option 2' },
          ]"
        >
          <template #label>Group Label</template>
          <PlRadio value="option-3" disabled>
            Option 3 (disabled; passed through default slot)
          </PlRadio>
        </PlRadioGroup>
        <output>Current value: {{ groupWithOptionsValue ?? "<unset>" }}</output>
      </div>
    </PlRow>
  </PlBlockPage>
</template>

<style module>
  .container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    h1 {
      font-size: 2rem;
      line-height: 1.5;
      margin-block-end: 16px;
    }
    output {
      margin-block-start: 12px;
    }
  }
</style>
