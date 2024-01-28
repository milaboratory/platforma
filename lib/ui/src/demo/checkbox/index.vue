<script lang="ts" setup>
import Layout from '@/demo/Layout.vue';
import Split from '@/demo/Split.vue';
import UiCheckbox from '@/lib/components/UiCheckbox.vue';
import CheckboxGroup from '@/lib/components/CheckboxGroup.vue';
import { reactive } from 'vue';
import WebCheckbox from '@/lib/components/WebCheckbox';

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

function onChanged(e: CustomEvent<boolean>) {
  data.checked = e.detail;
}

WebCheckbox.define();
</script>

<template>
  <layout>
    <split name="Checkbox">
      <div class="flex-row" style="gap: 12px">
        <div class="text-color">Data: {{ data }}</div>
        <div style="display: flex; align-items: center; gap: 8px; margin-left: auto">
          <span>Disable all</span>
          <ui-checkbox v-model="data.disabled" />
        </div>
      </div>
      <div class="flex-row" style="gap: 12px">
        <ui-checkbox v-model="data.checked" :disabled="data.disabled" />
        <span>Vue component</span>
      </div>
      <div class="flex-row" style="gap: 12px">
        <web-checkbox :disabled="data.disabled" :checked="data.checked" @change="onChanged" />
        <span>Web component</span>
      </div>
      <div class="flex-row" style="gap: 12px">Values: {{ data.values }}</div>
      <div class="flex-row" style="gap: 12px">
        <checkbox-group v-model="data.values" label="Label" :disabled="data.disabled" :options="options" />
      </div>
    </split>
  </layout>
</template>
