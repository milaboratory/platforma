<script lang="ts" setup>
import { reactive } from 'vue';
import Layout from '@/demo/Layout.vue';
import Split from '@/demo/Split.vue';
import MultiDropdown from '@/lib/components/MultiDropdown.vue';
import { generate } from '@/lib/helpers/functions';
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
  text: { title: `Title ${i} ${faker.lorem.sentence({ min: 1, max: 20 })}`, description: `Description ${i}` },
  // value: {
  //   i,
  // },
  value: i,
}));
</script>

<template>
  <layout>
    <split name="Multi Dropdown" style="min-height: 600px">
      {{ data.value }}
      <multi-dropdown v-model="data.value" placeholder="Hello" label="Placeholder" :options="optionsTitleAndDescription" />
      <multi-dropdown v-model="data.value" placeholder="Hello" label="Placeholder" :options="options" />
      <multi-dropdown v-model="data.value" label="Label" :options="options" />
      <multi-dropdown v-model="data.value" label="Has tooltip" :options="options">
        <template #tooltip> Tooltip content Second line Third line </template>
      </multi-dropdown>
      <multi-dropdown v-model="data.value" label="Has error" :options="options" error="Some error description" />
      <multi-dropdown v-model="data.value" label="Disabled" :disabled="true" :options="options" />
    </split>
  </layout>
</template>
