<template>
  <PlNumberField
    v-model="model"
    :min-value="3"
    :max-value="14"
    label="Number"
  />
</template>

<script setup lang="ts">
import { PlNumberField } from '@platforma-sdk/ui-vue';
import { ref } from 'vue';

const model = ref(7);
</script>
