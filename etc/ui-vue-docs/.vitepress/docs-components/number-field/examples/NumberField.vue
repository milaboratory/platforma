<script setup lang="ts">
import { PlNumberField } from '@platforma-sdk/ui-vue';
import { ref } from 'vue';

const model = ref(7);
</script>

<template>
  <PlNumberField
    v-model="model"
    label="Number label"
    placeholder="Number placeholder"
  />
</template>
