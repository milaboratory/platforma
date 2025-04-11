<script setup lang="ts">
import Layout from '@/Layout.vue';
import Split from '@/Split.vue';
import { PlRadio, PlRadioGroup } from '@milaboratories/uikit';
import { ref } from 'vue';

const standaloneValue = ref<string>();
const groupValue = ref<string>();
</script>

<template>
  <Layout>
    <Split name="Radio" hide-second>
      <div :class="$style.container">
        <h1>Standalone</h1>
        <PlRadio v-model="standaloneValue" :value="'option-1'" name="standalone">Option 1</PlRadio>
        <PlRadio v-model="standaloneValue" :value="'option-2'" name="standalone">Option 2</PlRadio>
        <PlRadio v-model="standaloneValue" :value="'option-3'" name="standalone" disabled>Option 3 (disabled)</PlRadio>
        <output>Current value: {{ standaloneValue ?? "<unset>" }}</output>
      </div>
      <div :class="$style.container">
        <h1>Grouped</h1>
        <PlRadioGroup v-model="groupValue" name="group">
          <template #label>Group Label</template>
          <PlRadio :value="'option-1'">Option 1</PlRadio>
          <PlRadio :value="'option-2'">Option 2</PlRadio>
          <PlRadio :value="'option-3'" disabled>Option 3 (disabled)</PlRadio>
        </PlRadioGroup>
        <output>Current value: {{ groupValue ?? "<unset>" }}</output>
      </div>
    </Split>
  </Layout>
</template>

<style module>
  .container {
    display: flex;
    flex-direction: column;
    max-inline-size: max-content;
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
