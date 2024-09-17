<script lang="ts" setup>
import { reactive } from 'vue';
import Layout from '@/Layout.vue';
import Split from '@/Split.vue';
import { PlDropdownMulti } from '@milaboratory/platforma-uikit.lib';
import { generate } from '@/imports';
import { faker } from '@faker-js/faker';

const data = reactive({
  value: [],
});

const options = generate(100, (i) => ({
  text: `Option ${i}`,
  value: {
    i,
  },
}));

const optionsTitleAndDescription = generate(100, (i) => ({
  text: `Title ${i} ${faker.lorem.sentence({ min: 1, max: 20 })}`,
  description: `Description ${i}`,
  value: i,
}));
</script>

<template>
  <Layout>
    <Split name="Multi Dropdown" style="min-height: 600px">
      {{ data.value }}
      <PlDropdownMulti v-model="data.value" placeholder="Hello" label="Placeholder" :options="optionsTitleAndDescription" />
      <PlDropdownMulti v-model="data.value" placeholder="Hello" label="Placeholder" :options="options" />
      <PlDropdownMulti v-model="data.value" label="Label" :options="options" />
      <PlDropdownMulti v-model="data.value" label="Has tooltip" :options="options">
        <template #tooltip> Tooltip content Second line Third line </template>
      </PlDropdownMulti>
      <PlDropdownMulti v-model="data.value" label="Has error" :options="options" error="Some error description" />
      <PlDropdownMulti v-model="data.value" label="Disabled" :disabled="true" :options="options" />
    </Split>
  </Layout>
</template>
