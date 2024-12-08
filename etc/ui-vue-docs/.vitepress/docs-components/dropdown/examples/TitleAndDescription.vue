<script setup lang="ts">
import { ref } from 'vue';
import { PlDropdown } from '@platforma-sdk/ui-vue';
import { faker } from '@faker-js/faker';

const options = [
  {
    text: 'Item text 1',
    description: faker.lorem.paragraph(),
    value: { prop: 1 },
  },
  {
    text: 'Item text 2',
    description: faker.lorem.paragraph(),
    value: { prop: 2 },
  },
  {
    text: 'Item text 3',
    description: faker.lorem.paragraph(),
    value: { prop: 3 },
  },
  {
    text: 'Item text 4',
    description: faker.lorem.paragraph(),
    value: { prop: 4 },
  },
];

const model = ref({ prop: 2 });
</script>

<template>
  <PlDropdown
    v-model="model"
    :options="options"
    label="Label text"
    placeholder="Select an item"
    clearable
  />
</template>
