<script lang="ts" setup>
import Layout from '@/Layout.vue';
import Split from '@/Split.vue';
import { UiCheckbox, PlCheckbox, PlCheckboxGroup } from '@milaboratory/platforma-uikit.lib';
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
      <pre class="text-color">Data: {{ data }}</pre>
      <div class="flex-row" style="gap: 12px">
        <span>Disable all</span>
        <UiCheckbox v-model="data.disabled" />
      </div>
      <div class="flex-row" style="gap: 12px">
        <UiCheckbox v-model="data.checked" :disabled="data.disabled" />
        <span>Vue component</span>
      </div>
      <div class="flex-row" style="gap: 12px">Values: {{ data.values }}</div>
      <div class="flex-row" style="gap: 12px">
        <PlCheckboxGroup v-model="data.values" label="Label" :disabled="data.disabled" :options="options" />
      </div>
      <div>
        <PlCheckbox v-model="data.checked" :disabled="data.disabled">Checkbox with label</PlCheckbox>
      </div>
    </Split>
  </Layout>
</template>
