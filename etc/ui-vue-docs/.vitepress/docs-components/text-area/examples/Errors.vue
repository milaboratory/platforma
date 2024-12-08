<script setup lang="ts">
import { PlTextArea } from '@platforma-sdk/ui-vue';
import { ref } from 'vue';

const model = ref('Lorem ipsum dolor sit amet consectetur ad.');
const rules = [
  (v?: string) =>
    (!!v && v.length < 40)
    || '(rule) Length must be less than 44 chars.',
];
</script>

<template>
  <PlTextArea
    v-model="model"
    :rows="3"
    :rules="rules"
    label="Label"
    placeholder="Enter text"
  />
</template>
