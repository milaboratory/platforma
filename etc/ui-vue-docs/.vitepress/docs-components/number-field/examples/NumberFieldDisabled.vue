<template>
  <PlNumberField v-model="model" disabled label="Number" />
</template>

<script setup lang="ts">
import { PlNumberField } from '@platforma-sdk/ui-vue';
import { ref } from 'vue';

const model = ref(7);
</script>
