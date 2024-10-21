<script setup lang="ts">
import { PlToggleSwitch } from '@platforma-sdk/ui-vue';
import { ref } from 'vue';

const model = ref(false);
</script>

<template>
  <PlToggleSwitch v-model="model" label="Show/hide" />
</template>
