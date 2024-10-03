<script setup lang="ts">
import { fa } from '@faker-js/faker';
import { PlBlockPage, PlDropdown } from '@platforma-sdk/ui-vue';
import { reactive } from 'vue';

const data = reactive({
  model: 1,
});

const options = [{
  label: 'One',
  value: 1
}, {
  label: 'Two',
  value: 2
}, {
  text: 'Three',
  value: 3
}, {
  text: 'NaN',
  value: NaN
}];
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <PlDropdown label="Select number" v-model="data.model" :options="options" />
  </PlBlockPage>
</template>
