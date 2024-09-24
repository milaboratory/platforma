<script lang="ts" setup>
import { reactive } from 'vue';
import Layout from '@/Layout.vue';
import { PlBtnGroup } from '@milaboratories/uikit';
import Split from '@/Split.vue';
import { generate } from '@/imports';

const data = reactive({
  num: 1,
});

const options = generate(3, (i) => ({
  text: `Option ${i}`,
  value: i,
}));

const options2 = [
  {
    text: 'A',
    value: 1,
  },
  {
    text: 'B',
    value: 2,
  },
  {
    text: 'C',
    value: 3,
  },
];
</script>

<template>
  <Layout>
    <Split name="Button Group">
      <PlBtnGroup v-model="data.num" label="Label" :options="options" />
      <PlBtnGroup v-model="data.num" label="Label" :options="options">
        <template #tooltip> Tooltip content Second row </template>
      </PlBtnGroup>
      <PlBtnGroup v-model="data.num" label="Label" disabled :options="options2" />
      <PlBtnGroup v-model="data.num" label="Label" :options="options2" />
      <PlBtnGroup v-model="data.num" label="Label (required)" :options="options2" required />
    </Split>
  </Layout>
</template>
