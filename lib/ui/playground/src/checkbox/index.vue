<script lang="ts" setup>
import Layout from '@/Layout.vue';
import Split from '@/Split.vue';
import { PlCheckbox, PlCheckboxGroup } from '@milaboratory/platforma-uikit.lib';
import { reactive } from 'vue';

const data = reactive({
  checked: false,
  values: [] as number[],
  disabled: false,
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
  <Layout>
    <Split name="Checkbox">
      <pre class="text-color" style="min-height: 120px; border: 1px solid #ccc; padding: 12px">Data: {{ data }}</pre>
      <div class="flex-row" style="gap: 12px">
        <span>Disable all</span>
        <PlCheckbox v-model="data.disabled" />
      </div>
      <div class="flex-row" style="gap: 12px">
        <PlCheckbox v-model="data.checked" :disabled="data.disabled" />
        <span>Vue component</span>
      </div>
      <div class="flex-row" style="gap: 12px">Values: {{ data.values }}</div>
      <div class="flex-row" style="gap: 12px">
        <PlCheckboxGroup v-model="data.values" label="Label" :disabled="data.disabled" :options="options" />
      </div>
      <div>
        <PlCheckbox v-model="data.checked" :disabled="data.disabled">Checkbox with label</PlCheckbox>
        <h4>Without label</h4>
        <PlCheckbox v-model="data.checked" :disabled="data.disabled" />
      </div>
    </Split>
  </Layout>
</template>
